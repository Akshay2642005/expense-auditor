package gemini

import (
	"bytes"
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"google.golang.org/genai"
)

const (
	// PDF extraction needs a generative model because this code path uses`r`n`t// GenerateContent over an uploaded Files API asset.`r`n`t
	pdfExtractionModel = "gemini-3.1-pro-preview"

	// fileStatePollInterval is how long to wait between Files API state polls.
	fileStatePollInterval = 2 * time.Second

	// fileStatePollTimeout is the max time to wait for ACTIVE state.
	fileStatePollTimeout = 60 * time.Second
)

// pdfExtractionPrompt asks the model to output text page-by-page with PAGE N
// markers so parsePagedText can split the result into a map.
const pdfExtractionPrompt = `Extract all text from this PDF document verbatim.

Format your response EXACTLY as follows — use this marker before each page's text:

PAGE 1
<text from page 1>

PAGE 2
<text from page 2>

...and so on for every page.

Rules:
- Do NOT summarise, paraphrase, or omit any text.
- Preserve line breaks within each page.
- If a page is blank or unreadable, write the marker followed by "(blank)".`

// ExtractPDFText uploads pdfBytes to the Gemini Files API, requests full text
// extraction page-by-page, deletes the uploaded file, and returns a map of
// page number → extracted text.
//
// The Files API is used instead of inline base64 because large PDFs exceed
// the inline size limit and multi-page handling is more reliable this way.
func (c *Client) ExtractPDFText(ctx context.Context, pdfBytes []byte) (map[int]string, error) {
	// 1. Upload PDF via Files API.
	uploaded, err := c.gc.Files.Upload(ctx, bytes.NewReader(pdfBytes), &genai.UploadFileConfig{
		MIMEType:    "application/pdf",
		DisplayName: "expense-policy.pdf",
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: files upload: %w", err)
	}

	// Always clean up — ignore delete errors since the file will expire anyway.
	defer func() {
		_, _ = c.gc.Files.Delete(ctx, uploaded.Name, nil)
	}()

	// 2. Poll until the file leaves PROCESSING state.
	file, err := c.waitForFileActive(ctx, uploaded.Name)
	if err != nil {
		return nil, err
	}

	// 3. Generate content referencing the uploaded file URI.
	contents := []*genai.Content{
		{
			Role: "user",
			Parts: []*genai.Part{
				{
					FileData: &genai.FileData{
						FileURI:  file.URI,
						MIMEType: "application/pdf",
					},
				},
				{Text: pdfExtractionPrompt},
			},
		},
	}

	resp, err := c.gc.Models.GenerateContent(ctx, pdfExtractionModel, contents, nil)
	if err != nil {
		return nil, fmt.Errorf("gemini: pdf extract generate: %w", err)
	}
	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return nil, fmt.Errorf("gemini: pdf extract: empty candidates in response")
	}

	// Collect all text parts from the first candidate.
	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		sb.WriteString(part.Text)
	}

	raw := strings.TrimSpace(sb.String())
	if raw == "" {
		return nil, fmt.Errorf("gemini: pdf extract: empty response text")
	}

	// 4. Parse PAGE N markers into a map.
	return parsePagedText(raw), nil
}

// waitForFileActive polls the Files API until the file reaches ACTIVE state
// or the timeout is exceeded.
func (c *Client) waitForFileActive(ctx context.Context, name string) (*genai.File, error) {
	deadline := time.Now().Add(fileStatePollTimeout)

	for {
		f, err := c.gc.Files.Get(ctx, name, nil)
		if err != nil {
			return nil, fmt.Errorf("gemini: files get %q: %w", name, err)
		}

		switch f.State {
		case genai.FileStateActive:
			return f, nil
		case genai.FileStateFailed:
			return nil, fmt.Errorf("gemini: file %q entered FAILED state", name)
		default: // PROCESSING or unknown — keep waiting
			if time.Now().After(deadline) {
				return nil, fmt.Errorf("gemini: file %q still not ACTIVE after %s", name, fileStatePollTimeout)
			}
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(fileStatePollInterval):
			}
		}
	}
}

// parsePagedText splits a model response containing "PAGE N" markers into a
// map of page number → text. Pages not present in the response are omitted.
//
// Example input:
//
//	PAGE 1
//	Invoice details...
//
//	PAGE 2
//	Line items...
func parsePagedText(raw string) map[int]string {
	pages := make(map[int]string)
	lines := strings.Split(raw, "\n")

	currentPage := 0
	var buf strings.Builder

	flush := func() {
		if currentPage > 0 {
			pages[currentPage] = strings.TrimSpace(buf.String())
			buf.Reset()
		}
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Detect "PAGE N" marker (case-insensitive, tolerates extra spaces).
		upper := strings.ToUpper(trimmed)
		if strings.HasPrefix(upper, "PAGE ") {
			remainder := strings.TrimSpace(upper[5:])
			if n, err := strconv.Atoi(remainder); err == nil {
				flush()
				currentPage = n
				continue
			}
		}

		if currentPage > 0 {
			buf.WriteString(line)
			buf.WriteByte('\n')
		}
	}

	flush()
	return pages
}

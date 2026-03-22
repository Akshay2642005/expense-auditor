package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

// Client wraps the unified Google Gen AI SDK.
type Client struct {
	gc *genai.Client
}

// NewClient creates a persistent Gemini client using google.golang.org/genai.
func NewClient(ctx context.Context, apiKey string) (*Client, error) {
	gc, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, fmt.Errorf("gemini: create client: %w", err)
	}
	return &Client{gc: gc}, nil
}

// ExtractReceiptData sends an image to Gemini Flash and parses the structured OCR output.
func (c *Client) ExtractReceiptData(ctx context.Context, imageData []byte, mimeType string) (*OCRResult, error) {
	contents := []*genai.Content{
		{
			Role: "user",
			Parts: []*genai.Part{
				{
					InlineData: &genai.Blob{
						MIMEType: mimeType,
						Data:     imageData,
					},
				},
				{Text: ocrPrompt},
			},
		},
	}

	resp, err := c.gc.Models.GenerateContent(
		ctx,
		"gemini-2.5-flash",
		contents,
		&genai.GenerateContentConfig{
			ResponseMIMEType: "application/json",
		},
	)
	if err != nil {
		return nil, fmt.Errorf("gemini: generate content: %w", err)
	}

	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return nil, fmt.Errorf("gemini: empty candidates in response")
	}

	// Collect all text parts from the first candidate.
	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		sb.WriteString(part.Text)
	}

	text := strings.TrimSpace(sb.String())
	// Safety net — strip any accidental markdown fences.
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var result OCRResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, fmt.Errorf("gemini: parse OCR JSON %q: %w", text, err)
	}

	result.RawJSON = text
	return &result, nil
}

package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

// OCRResult is the structured output extracted from a receipt image.
// It is stored as-is in claims.ocr_raw_json and individual columns are
// promoted to the claim row after validation.
type OCRResult struct {
	MerchantName string  `json:"merchant_name"`
	Date         string  `json:"date"`
	TotalAmount  float64 `json:"total_amount"`
	Currency     string  `json:"currency"`
	Confidence   float64 `json:"confidence"`
	RawJSON      string  `json:"-"`
}

type ocrResultRaw struct {
	MerchantName *string  `json:"merchant_name"`
	Date         *string  `json:"date"`
	TotalAmount  *float64 `json:"total_amount"`
	Currency     *string  `json:"currency"`
	Confidence   *float64 `json:"confidence"`
}

func normalizeOCRResult(raw ocrResultRaw) OCRResult {
	var result OCRResult
	if raw.MerchantName != nil {
		result.MerchantName = *raw.MerchantName
	}
	if raw.Date != nil {
		result.Date = *raw.Date
	}
	if raw.TotalAmount != nil {
		result.TotalAmount = *raw.TotalAmount
	}
	if raw.Currency != nil {
		result.Currency = *raw.Currency
	}
	if raw.Confidence != nil {
		result.Confidence = *raw.Confidence
	}
	return result
}

func confidenceValue(raw ocrResultRaw) float64 {
	if raw.Confidence == nil {
		return 0
	}
	return *raw.Confidence
}

const ocrPrompt = `Extract information from this receipt image and return ONLY a valid JSON object with no markdown, no backticks, and no explanation:
{
  "merchant_name": "name of the store, restaurant, or vendor",
  "date": "YYYY-MM-DD format, or empty string if not found",
  "total_amount": numeric value only (e.g. 45.50), or 0 if not found,
  "currency": "3-letter ISO 4217 currency code (e.g. USD, EUR, GBP, INR), or empty string if not found",
  "confidence": a number from 0.0 to 1.0 indicating overall extraction confidence
}
Use null for any field that cannot be determined. Return raw JSON only.`

// ExtractReceiptData sends imageData to Gemini Flash with a JSON-mode prompt
// and returns the parsed OCRResult.
//
// mimeType should be "image/jpeg", "image/png", or "application/pdf".
// For multi-page PDFs prefer ExtractPDFText — inline base64 is unreliable
// above a single page.
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

	var raw ocrResultRaw
	if err := json.Unmarshal([]byte(text), &raw); err == nil {
		result := normalizeOCRResult(raw)
		result.RawJSON = text
		return &result, nil
	} else {
		var raws []ocrResultRaw
		if err2 := json.Unmarshal([]byte(text), &raws); err2 == nil {
			if len(raws) == 0 {
				return nil, fmt.Errorf("gemini: parse OCR JSON %q: empty array", text)
			}
			best := raws[0]
			bestConf := confidenceValue(best)
			for _, r := range raws[1:] {
				if confidenceValue(r) > bestConf {
					best = r
					bestConf = confidenceValue(r)
				}
			}
			result := normalizeOCRResult(best)
			result.RawJSON = text
			return &result, nil
		}
		return nil, fmt.Errorf("gemini: parse OCR JSON %q: %w", text, err)
	}
}

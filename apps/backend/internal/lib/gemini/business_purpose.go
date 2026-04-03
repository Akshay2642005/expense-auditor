package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

// BusinessPurposeCheck captures whether the submitted business purpose is
// plausibly consistent with the receipt details extracted during OCR.
type BusinessPurposeCheck struct {
	Verdict    string  `json:"verdict"` // consistent|mismatch|unclear
	Reason     string  `json:"reason"`
	Confidence float64 `json:"confidence"`
}

const businessPurposeSystemPrompt = `You validate whether a submitted expense business purpose is plausibly consistent with the receipt details.

Be conservative:
- Return "mismatch" only when the business purpose is clearly unrelated, misleading, personal, or contradicted by the merchant/category/receipt context.
- Return "consistent" when the purpose is plausible for the receipt.
- Return "unclear" when there is not enough context to judge confidently.

Return ONLY valid JSON in this shape:
{
  "verdict": "consistent|mismatch|unclear",
  "reason": "1-2 short sentences explaining the judgment",
  "confidence": 0.0
}`

const businessPurposeUserTemplate = `SUBMITTED CLAIM:
Business purpose: %s
Expense category: %s

RECEIPT DETAILS:
Merchant: %s
Amount: %s %s
Receipt date: %s

Judge whether the business purpose is plausibly consistent with the receipt details.`

func (c *Client) AssessBusinessPurposeConsistency(
	ctx context.Context,
	businessPurpose string,
	expenseCategory string,
	merchantName string,
	amount string,
	currency string,
	receiptDate string,
) (*BusinessPurposeCheck, error) {
	userPrompt := fmt.Sprintf(
		businessPurposeUserTemplate,
		businessPurpose,
		expenseCategory,
		emptyIfMissing(merchantName),
		emptyIfMissing(amount),
		emptyIfMissing(currency),
		emptyIfMissing(receiptDate),
	)

	resp, err := c.gc.Models.GenerateContent(
		ctx,
		"gemini-2.5-flash",
		[]*genai.Content{
			{
				Role:  "user",
				Parts: []*genai.Part{{Text: userPrompt}},
			},
		},
		&genai.GenerateContentConfig{
			SystemInstruction: &genai.Content{
				Parts: []*genai.Part{{Text: businessPurposeSystemPrompt}},
			},
			ResponseMIMEType: "application/json",
		},
	)
	if err != nil {
		return nil, fmt.Errorf("gemini: business purpose consistency: %w", err)
	}

	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return nil, fmt.Errorf("gemini: empty candidates in business purpose response")
	}

	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		sb.WriteString(part.Text)
	}

	text := strings.TrimSpace(sb.String())
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var check BusinessPurposeCheck
	if err := json.Unmarshal([]byte(text), &check); err != nil {
		return nil, fmt.Errorf("gemini: parse business purpose JSON %q: %w", text, err)
	}

	switch check.Verdict {
	case "consistent", "mismatch", "unclear":
	default:
		return nil, fmt.Errorf("gemini: unexpected business purpose verdict %q", check.Verdict)
	}

	return &check, nil
}

func emptyIfMissing(value string) string {
	if strings.TrimSpace(value) == "" {
		return "unknown"
	}
	return value
}

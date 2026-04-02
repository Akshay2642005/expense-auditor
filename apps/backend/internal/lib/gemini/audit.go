package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

// AuditResult is the structured output from Gemini for an expense audit.
type AuditResult struct {
	Decision        string  `json:"decision"` // approved|flagged|rejected
	Reason          string  `json:"reason"`
	CitedPolicyText string  `json:"cited_policy_text"`
	Confidence      float64 `json:"confidence"`
}

const auditSystemPrompt = `You are an impartial expense auditing assistant. You will be given an employee expense claim and excerpts from the company's expense policy. Your job is to decide whether to approve, flag, or reject the claim based solely on what the policy says.

Decision rules:
- approved: the claim clearly complies with the policy
- flagged: the claim raises concerns but may be legitimate — a human reviewer should decide
- rejected: the claim clearly violates a specific policy rule

You MUST always populate "cited_policy_text" with the most relevant policy excerpt. Never leave it empty or null.

Return ONLY a valid JSON object with no markdown fences, no preamble, no explanation outside the JSON:
{
  "decision": "approved|flagged|rejected",
  "reason": "2-3 sentences explaining the decision, referencing the specific policy rule and the claim details (amount, category, merchant)",
  "cited_policy_text": "the exact verbatim policy excerpt that most directly applies to this decision — copy it in full, do not paraphrase or truncate",
  "confidence": 0.0
}`

const auditUserTemplate = `EXPENSE CLAIM:
Business purpose: %s
Expense category: %s
Claimed date: %s
Merchant: %s
Amount: %s %s
Receipt date: %s
Date mismatch flag: %v

RELEVANT POLICY EXCERPTS:
%s

Return ONLY the JSON object. Rules:
- "decision" must be one of: "approved", "flagged", "rejected"
- "reason" must be 2-3 sentences referencing the specific policy rule AND the claim details
- "cited_policy_text" MUST contain the verbatim policy excerpt — never empty, never null
- "confidence" is a float 0.0–1.0`

// AuditClaim calls Gemini to audit a single expense claim against policy excerpts.
func (c *Client) AuditClaim(ctx context.Context, claimDetails, policyChunks string) (*AuditResult, string, error) {
	userPrompt := claimDetails + "\n\nRELEVANT POLICY EXCERPTS:\n" + policyChunks

	contents := []*genai.Content{
		{
			Role:  "user",
			Parts: []*genai.Part{{Text: userPrompt}},
		},
	}

	resp, err := c.gc.Models.GenerateContent(
		ctx,
		"gemini-2.5-flash",
		contents,
		&genai.GenerateContentConfig{
			SystemInstruction: &genai.Content{
				Parts: []*genai.Part{{Text: auditSystemPrompt}},
			},
			ResponseMIMEType: "application/json",
		},
	)
	if err != nil {
		return nil, "", fmt.Errorf("gemini: audit generate content: %w", err)
	}

	if len(resp.Candidates) == 0 || resp.Candidates[0].Content == nil {
		return nil, "", fmt.Errorf("gemini: empty candidates in audit response")
	}

	var sb strings.Builder
	for _, part := range resp.Candidates[0].Content.Parts {
		sb.WriteString(part.Text)
	}

	rawText := sb.String()
	text := strings.TrimSpace(rawText)
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var result AuditResult
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		return nil, rawText, fmt.Errorf("gemini: parse audit JSON %q: %w", text, err)
	}

	switch result.Decision {
	case "approved", "flagged", "rejected":
	default:
		return nil, rawText, fmt.Errorf("gemini: unexpected audit decision %q", result.Decision)
	}

	return &result, rawText, nil
}

// FormatAuditClaimDetails builds the claim details string sent to Gemini.
func FormatAuditClaimDetails(
	businessPurpose, expenseCategory, claimedDate, merchantName,
	currency, amount, receiptDate string,
	dateMismatch bool,
) string {
	return fmt.Sprintf(
		auditUserTemplate[:strings.Index(auditUserTemplate, "\nRELEVANT")],
		businessPurpose, expenseCategory, claimedDate,
		merchantName, currency, amount, receiptDate, dateMismatch,
	)
}

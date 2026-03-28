package job

// This file contains the audit-specific job handling logic.

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

// EnqueueAuditJob — called from retrieveAndSavePolicy (Phase 2 handler)
// after a claim reaches status = policy_matched.
// ---------------------------------------------------------------------------

func EnqueueAuditJob(claimID uuid.UUID) {
	if auditJobClient == nil {
		return
	}
	task, err := NewAuditClaimTask(claimID)
	if err != nil {
		return
	}
	_, _ = auditJobClient.Enqueue(task) // non-fatal; claim is already policy_matched
}

// handleAuditTask — main audit job handler
// ---------------------------------------------------------------------------

func (j *JobService) handleAuditTask(ctx context.Context, t *asynq.Task) error {
	var p AuditPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("audit: unmarshal payload: %w", err)
	}

	log := j.logger.With().Str("claim_id", p.ClaimID.String()).Logger()
	log.Info().Msg("starting audit job")

	// Mark claim as auditing
	if err := j.claimService.SetClaimJobStatus(ctx, p.ClaimID, model.ClaimStatusAuditing); err != nil {
		log.Error().Err(err).Msg("failed to set status=auditing")
		return err
	}

	claim, err := j.claimService.GetClaimForJob(ctx, p.ClaimID)
	if err != nil {
		log.Error().Err(err).Msg("failed to load claim for audit")
		return fmt.Errorf("audit: load claim: %w", err)
	}

	chunks, err := model.UnmarshalRetrievedChunks(claim.PolicyChunksUsed)
	if err != nil {
		log.Warn().Err(err).Msg("could not parse policy_chunks_used, treating as empty")
	}

	// ----- Auto-flag if no policy -----

	if len(chunks) == 0 {
		log.Info().Msg("no policy chunks — auto-flagging")
		rule := "no_policy_on_file"
		return j.auditService.SaveJobAuditDecision(ctx, p.ClaimID,
			model.AuditDecisionFlagged,
			"This claim cannot be audited because no expense policy is currently active. "+
				"Please upload a policy and re-submit for audit.",
			nil, 1.0, "deterministic", &rule)
	}

	// ----- Build strings for Gemini -----

	claimDetails := fmt.Sprintf(
		"Business purpose: %s\nExpense category: %s\nClaimed date: %s\n"+
			"Merchant: %s\nAmount: %s %s\nReceipt date: %s\nDate mismatch: %v",
		claim.BusinessPurpose,
		string(claim.ExpenseCategory),
		claim.ClaimedDate.Format("2006-01-02"),
		claimMerchantName(claim),
		claimCurrency(claim),
		claimAmount(claim),
		claimReceiptDate(claim),
		claim.DateMismatch,
	)

	var policyBuilder strings.Builder
	for i, ch := range chunks {
		fmt.Fprintf(&policyBuilder, "[Excerpt %d — category: %s]\n%s\n\n", i+1, ch.Category, ch.ChunkText)
	}

	// ----- Gemini audit call -----

	result, rawOutput, err := auditGeminiClient.AuditClaim(ctx, claimDetails, strings.TrimSpace(policyBuilder.String()))
	if err != nil {
		log.Error().Err(err).Msg("gemini audit call failed — flagging for human review")
		return j.auditService.SaveJobAuditDecision(ctx, p.ClaimID,
			model.AuditDecisionFlagged,
			"Automated audit could not complete due to an AI service error. Human review required.",
			nil, 0.0, "gemini-3.1-pro-preview", nil)
	}

	log.Info().
		Str("decision", result.Decision).
		Float64("confidence", result.Confidence).
		Msg("audit decision received")

	var decision model.AuditDecisionStatus
	switch result.Decision {
	case "approved":
		decision = model.AuditDecisionApproved
	case "rejected":
		decision = model.AuditDecisionRejected
	default:
		decision = model.AuditDecisionFlagged
	}

	var cited *string
	if result.CitedPolicyText != "" {
		cited = &result.CitedPolicyText
	}

	return j.auditService.SaveJobAuditDecisionWithRaw(ctx, p.ClaimID,
		decision, result.Reason, cited,
		result.Confidence, "gemini-3.1-pro-preview-05-06", nil, &rawOutput)
}

func claimMerchantName(claim *model.Claim) string {
	if claim.MerchantName == nil || *claim.MerchantName == "" {
		return "unknown"
	}
	return *claim.MerchantName
}

func claimCurrency(claim *model.Claim) string {
	if claim.Currency == nil {
		return ""
	}
	return *claim.Currency
}

func claimAmount(claim *model.Claim) string {
	if claim.Amount == nil {
		return "0"
	}
	return strconv.FormatFloat(*claim.Amount, 'f', -1, 64)
}

func claimReceiptDate(claim *model.Claim) string {
	if claim.ReceiptDate == nil {
		return ""
	}
	return claim.ReceiptDate.Format("2006-01-02")
}

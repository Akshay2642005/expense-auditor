package service

import (
	"context"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/rs/zerolog"
)

func shouldNotifyClaimOutcomeTransition(previous, next model.ClaimStatus) bool {
	if previous == next {
		return false
	}

	switch next {
	case model.ClaimStatusApproved, model.ClaimStatusRejected, model.ClaimStatusFlagged, model.ClaimStatusNeedsReview:
		return true
	default:
		return false
	}
}

func claimOutcomeReason(status model.ClaimStatus, provided string) string {
	if trimmed := strings.TrimSpace(provided); trimmed != "" {
		return trimmed
	}

	switch status {
	case model.ClaimStatusApproved:
		return "Your expense claim was approved after the latest review."
	case model.ClaimStatusRejected:
		return "Your expense claim was rejected and needs changes before it can move forward."
	default:
		return "Your expense claim needs clarification before the review can be completed."
	}
}

func claimOCROutcomeReason(
	status model.ClaimStatus,
	dateMismatch bool,
	reviewReason *string,
) string {
	if reviewReason != nil {
		if trimmed := strings.TrimSpace(*reviewReason); trimmed != "" {
			return trimmed
		}
	}

	if status != model.ClaimStatusNeedsReview {
		return claimOutcomeReason(status, "")
	}

	if dateMismatch {
		return "The receipt date did not match the date submitted with the claim, so this expense needs clarification."
	}

	return "The uploaded receipt could not be verified confidently enough, so this expense needs clarification."
}

func claimPolicyOutcomeReason(status model.ClaimStatus, provided *string) string {
	if provided != nil {
		if trimmed := strings.TrimSpace(*provided); trimmed != "" {
			return trimmed
		}
	}

	switch status {
	case model.ClaimStatusFlagged:
		return "This claim appears to fall outside the active expense policy and now needs clarification."
	case model.ClaimStatusNeedsReview:
		return "The policy match needs clarification before the claim can move forward."
	default:
		return claimOutcomeReason(status, "")
	}
}

func enqueueClaimOutcomeNotification(
	_ context.Context,
	logger *zerolog.Logger,
	jobService *job.JobService,
	previous *model.Claim,
	current *model.Claim,
	reason string,
) {
	if logger == nil || jobService == nil || jobService.Client == nil || previous == nil || current == nil {
		return
	}

	if !shouldNotifyClaimOutcomeTransition(previous.Status, current.Status) {
		return
	}

	task, err := job.NewClaimOutcomeEmailTask(
		current.ID,
		current.Status,
		claimOutcomeReason(current.Status, reason),
	)
	if err != nil {
		logger.Warn().
			Err(err).
			Str("claim_id", current.ID.String()).
			Str("status", string(current.Status)).
			Msg("failed to build claim outcome email task")
		return
	}

	if _, err := jobService.Client.Enqueue(task); err != nil {
		logger.Warn().
			Err(err).
			Str("claim_id", current.ID.String()).
			Str("status", string(current.Status)).
			Msg("failed to enqueue claim outcome email task")
	}
}

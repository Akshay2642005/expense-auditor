package model

import (
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/google/uuid"
)

type AuditDecisionStatus string

const (
	AuditDecisionApproved AuditDecisionStatus = "approved"
	AuditDecisionFlagged  AuditDecisionStatus = "flagged"
	AuditDecisionRejected AuditDecisionStatus = "rejected"
)

type AuditDecision struct {
	ID                uuid.UUID           `json:"id"                          db:"id"`
	ClaimID           uuid.UUID           `json:"claimId"                     db:"claim_id"`
	Decision          AuditDecisionStatus `json:"decision"                    db:"decision"`
	Reason            string              `json:"reason"                      db:"reason"`
	CitedPolicyText   *string             `json:"citedPolicyText,omitempty"   db:"cited_policy_text"`
	Confidence        float64             `json:"confidence"                  db:"confidence"`
	AIModel           string              `json:"aiModel"                     db:"ai_model"`
	DeterministicRule *string             `json:"deterministicRule,omitempty" db:"deterministic_rule"`
	OverriddenBy      *string             `json:"overriddenBy,omitempty"      db:"overridden_by"`
	OverrideReason    *string             `json:"overrideReason,omitempty"    db:"override_reason"`
	RawModelOutput    *string             `json:"rawModelOutput,omitempty"    db:"raw_model_output"`
	CreatedAt         time.Time           `json:"createdAt"                   db:"created_at"`
}

type GetClaimAuditRequest struct {
	ID string `param:"id"`
}

func (r *GetClaimAuditRequest) Validate() error {
	if r.ID == "" {
		return errs.NewBadRequestError("id is required", true, nil, nil, nil)
	}
	if _, err := uuid.Parse(r.ID); err != nil {
		return errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}
	return nil
}

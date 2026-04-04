package repository

import (
	"context"
	"fmt"

	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepository struct {
	db *pgxpool.Pool
}

func NewAuditRepository(db *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{db: db}
}

// GetByClaimID returns the most recent audit decision for a claim.
// Returns pgx.ErrNoRows if no decision exists yet.
func (r *AuditRepository) GetByClaimID(ctx context.Context, claimID uuid.UUID) (*model.AuditDecision, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, claim_id, decision, reason, cited_policy_text,
		       confidence, ai_model, deterministic_rule,
		       overridden_by, override_reason, created_at
		FROM   audit_decisions
		WHERE  claim_id = $1
		ORDER  BY created_at DESC
		LIMIT  1
	`, claimID)
	if err != nil {
		return nil, fmt.Errorf("get audit by claim id: %w", err)
	}

	result, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.AuditDecision])
	if err != nil {
		return nil, err
	}

	return &result, nil
}

func (r *AuditRepository) SaveDecision(
	ctx context.Context,
	claimID uuid.UUID,
	decision model.AuditDecisionStatus,
	reason string,
	citedPolicyText *string,
	confidence float64,
	aiModel string,
	deterministicRule *string,
	rawModelOutput *string,
) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin audit decision tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Persist the full raw_model_output alongside the structured fields so we can
	// inspect the original LLM response when debugging parsing/truncation issues.
	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_decisions
			(claim_id, decision, reason, cited_policy_text, confidence, ai_model, deterministic_rule, raw_model_output)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, claimID, string(decision), reason, citedPolicyText, confidence, aiModel, deterministicRule, rawModelOutput); err != nil {
		return fmt.Errorf("insert audit decision: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE claims SET status = $1, updated_at = now() WHERE id = $2
	`, string(decision), claimID); err != nil {
		return fmt.Errorf("update claim status from audit decision: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit audit decision: %w", err)
	}

	return nil
}

func (r *AuditRepository) SaveOverrideDecision(
	ctx context.Context,
	claimID uuid.UUID,
	decision model.AuditDecisionStatus,
	reason string,
	overriddenBy string,
	citedPolicyText *string,
) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin audit override tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO audit_decisions
			(claim_id, decision, reason, cited_policy_text, confidence, ai_model, overridden_by, override_reason)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, claimID, string(decision), reason, citedPolicyText, 1.0, "human_override", overriddenBy, reason); err != nil {
		return fmt.Errorf("insert audit override decision: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE claims SET status = $1, updated_at = now() WHERE id = $2
	`, string(decision), claimID); err != nil {
		return fmt.Errorf("update claim status from audit override: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit audit override decision: %w", err)
	}

	return nil
}

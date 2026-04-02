package service

import (
	"context"
	"errors"

	"github.com/Akshay2642005/expense-auditor/internal/cache"
	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type AuditService struct {
	server *server.Server
	repos  *repository.Repositories
	job    *job.JobService
}

func NewAuditService(
	s *server.Server,
	repos *repository.Repositories,
) *AuditService {
	return &AuditService{
		server: s,
		repos:  repos,
		job:    s.Job,
	}
}

func (s *AuditService) GetClaimAudit(ctx context.Context, claimID uuid.UUID, userID string) (any, error) {
	key := cache.KeyAudit(claimID.String())

	// Check audit cache first — if hit, we still need to verify ownership.
	// Use the claim cache for the ownership check to avoid a DB round-trip.
	if cached, ok, _ := cache.Get[model.AuditDecision](ctx, s.server.Cache, key); ok {
		// Verify ownership via claim cache (also avoids DB)
		claimKey := cache.KeyClaim(claimID.String())
		if cachedClaim, claimOk, _ := cache.Get[model.Claim](ctx, s.server.Cache, claimKey); claimOk {
			if cachedClaim.UserID != userID {
				return nil, errs.NewForbiddenError("access denied", false)
			}
			return cached, nil
		}
		// Claim not in cache — fall through to DB ownership check below
	}

	ownerUserID, err := s.repos.Claim.GetClaimOwnerUserID(ctx, claimID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errs.NewNotFoundError("claim not found", false, nil)
		}
		return nil, err
	}
	if ownerUserID != userID {
		return nil, errs.NewForbiddenError("access denied", false)
	}

	// Re-check audit cache after ownership confirmed (may have been populated above)
	if cached, ok, _ := cache.Get[model.AuditDecision](ctx, s.server.Cache, key); ok {
		s.server.Logger.Debug().Str("key", key).Msg("cache hit: audit")
		return cached, nil
	}

	result, err := s.repos.Audit.GetByClaimID(ctx, claimID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			code := "AUDIT_NOT_READY"
			return nil, errs.NewNotFoundError("audit decision not yet available", true, &code)
		}
		return nil, err
	}

	_ = cache.Set(ctx, s.server.Cache, key, *result, cache.TTLAudit)
	return result, nil
}

func (s *AuditService) SaveJobAuditDecision(
	ctx context.Context,
	claimID uuid.UUID,
	decision model.AuditDecisionStatus,
	reason string,
	citedPolicyText *string,
	confidence float64,
	aiModel string,
	deterministicRule *string,
) error {
	if err := s.repos.Audit.SaveDecision(ctx, claimID, decision, reason, citedPolicyText, confidence, aiModel, deterministicRule, nil); err != nil {
		return err
	}
	s.invalidateClaimCaches(ctx, claimID)
	return nil
}

func (s *AuditService) SaveJobAuditDecisionWithRaw(
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
	if err := s.repos.Audit.SaveDecision(ctx, claimID, decision, reason, citedPolicyText, confidence, aiModel, deterministicRule, rawModelOutput); err != nil {
		return err
	}
	s.invalidateClaimCaches(ctx, claimID)
	return nil
}

// invalidateClaimCaches removes the individual claim, its audit, and the owner's
// claim list from Redis so the next read reflects the updated status.
func (s *AuditService) invalidateClaimCaches(ctx context.Context, claimID uuid.UUID) {
	keys := []string{
		cache.KeyAudit(claimID.String()),
		cache.KeyClaim(claimID.String()),
	}
	// Also bust the list cache so the status change is visible immediately
	if userID, err := s.repos.Claim.GetClaimOwnerUserID(ctx, claimID); err == nil {
		keys = append(keys, cache.KeyClaimList(userID))
	}
	_ = cache.Del(ctx, s.server.Cache, keys...)
}

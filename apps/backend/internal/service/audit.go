package service

import (
	"context"
	"errors"

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

	result, err := s.repos.Audit.GetByClaimID(ctx, claimID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			code := "AUDIT_NOT_READY"
			return nil, errs.NewNotFoundError("audit decision not yet available", true, &code)
		}
		return nil, err
	}
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
	return s.repos.Audit.SaveDecision(ctx, claimID, decision, reason, citedPolicyText, confidence, aiModel, deterministicRule, nil)
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
	return s.repos.Audit.SaveDecision(ctx, claimID, decision, reason, citedPolicyText, confidence, aiModel, deterministicRule, rawModelOutput)
}

package job

// handler.go is the composition point for job dependencies and task wiring.

import (
	"context"

	"github.com/hibiken/asynq"
	"github.com/rs/zerolog"

	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/Akshay2642005/expense-auditor/internal/lib/email"
	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
	"github.com/Akshay2642005/expense-auditor/internal/lib/storage"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/google/uuid"
)

var emailClient *email.Client

var (
	ocrGeminiClient     *gemini.Client
	ocrGCSClient        *storage.GCSClient
	ocrDateMismatchDays int
)

var (
	policyGeminiClient *gemini.Client
	policyGCSClient    *storage.GCSClient
)

var (
	auditGeminiClient *gemini.Client
	auditJobClient    *asynq.Client
)

type ClaimJobService interface {
	SetClaimJobStatus(ctx context.Context, claimID uuid.UUID, status model.ClaimStatus) error
	MarkClaimOCRFailed(ctx context.Context, claimID uuid.UUID, reason string) error
	SaveClaimOCRResult(ctx context.Context, claimID uuid.UUID, result *gemini.OCRResult, status model.ClaimStatus, dateMismatch bool, reviewReason *string) error
	GetClaimForJob(ctx context.Context, claimID uuid.UUID) (*model.Claim, error)
	SaveClaimPolicyMatch(ctx context.Context, claimID uuid.UUID, policyID uuid.UUID, chunks []model.RetrievedChunk, status model.ClaimStatus, notificationReason *string) error
	SetClaimOrgID(ctx context.Context, claimID uuid.UUID, orgID string) error
}

type PolicyJobService interface {
	GetActivePolicyForJob(ctx context.Context, orgID string) (*model.Policy, error)
	GetActivePolicyForUser(ctx context.Context, userID string) (*model.Policy, error)
	SearchRelevantPolicyChunks(ctx context.Context, policyID uuid.UUID, queryVector []float32, limit int) ([]model.RetrievedChunk, error)
	GetPolicyChunksForJob(ctx context.Context, policyID uuid.UUID) ([]model.RetrievedChunk, error)
	SetPolicyJobStatus(ctx context.Context, policyID uuid.UUID, status model.PolicyStatus, chunkCount int) error
	ActivatePolicyChunks(ctx context.Context, policyID uuid.UUID, chunks []model.PolicyChunkInsert) error
}

type AuditJobService interface {
	SaveJobAuditDecision(
		ctx context.Context,
		claimID uuid.UUID,
		decision model.AuditDecisionStatus,
		reason string,
		citedPolicyText *string,
		confidence float64,
		aiModel string,
		deterministicRule *string,
	) error
	SaveJobAuditDecisionWithRaw(
		ctx context.Context,
		claimID uuid.UUID,
		decision model.AuditDecisionStatus,
		reason string,
		citedPolicyText *string,
		confidence float64,
		aiModel string,
		deterministicRule *string,
		rawModelOutput *string,
	) error
}

func (j *JobService) InitHandlers(cfg *config.Config, logger *zerolog.Logger) {
	emailClient = email.NewClient(cfg, logger)
	clerk.SetKey(cfg.Auth.SecretKey)
}

func (j *JobService) InitOCRHandlers(g *gemini.Client, gcs *storage.GCSClient, dateMismatchDays int) {
	ocrGeminiClient = g
	ocrGCSClient = gcs
	ocrDateMismatchDays = dateMismatchDays
}

// InitPolicyHandlers wires dependencies needed by the policy ingestion and retrieval handlers.
func (j *JobService) InitPolicyHandlers(g *gemini.Client, gcs *storage.GCSClient) {
	policyGeminiClient = g
	policyGCSClient = gcs
}

func (j *JobService) InitAuditHandlers(g *gemini.Client) {
	auditGeminiClient = g
	auditJobClient = j.Client
}

func (j *JobService) SetServices(claimService ClaimJobService, policyService PolicyJobService, auditService AuditJobService) {
	j.claimService = claimService
	j.policyService = policyService
	j.auditService = auditService
}

func (j *JobService) registerHandlers(mux *asynq.ServeMux) {
	mux.HandleFunc(TaskOCRReceipt, j.handleOCRReceiptTask)
	mux.HandleFunc(TaskPolicyIngestion, j.handlePolicyIngestionTask)
	mux.HandleFunc(TaskAuditClaim, j.handleAuditTask)
	mux.HandleFunc(TaskWelcome, j.handleWelcomeEmailTask)
	mux.HandleFunc(TaskClaimOutcome, j.handleClaimOutcomeEmailTask)
}

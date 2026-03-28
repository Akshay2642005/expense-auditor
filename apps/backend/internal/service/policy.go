package service

import (
	"context"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/google/uuid"
)

type PolicyService struct {
	server *server.Server
	repos  *repository.Repositories
	job    *job.JobService
}

func NewPolicyService(
	s *server.Server,
	repos *repository.Repositories,
) *PolicyService {
	return &PolicyService{server: s, repos: repos, job: s.Job}
}

// UploadPolicy validates and stores a policy PDF, creates the DB record, and
// enqueues the background ingestion job.
func (s *PolicyService) UploadPolicy(
	ctx context.Context,
	file multipart.File,
	header *multipart.FileHeader,
	name, version, uploaderID, orgID string,
) (*model.Policy, error) {
	// Validate MIME type
	if header.Header.Get("Content-Type") != "application/pdf" {
		return nil, fmt.Errorf("policy file must be a PDF (got %s)", header.Header.Get("Content-Type"))
	}

	// Read bytes for GCS upload
	pdfBytes, err := io.ReadAll(file)
	if err != nil {
		return nil, fmt.Errorf("read policy file: %w", err)
	}
	if len(pdfBytes) == 0 {
		return nil, fmt.Errorf("policy file is empty")
	}

	// GCS path: policies/{orgID}/{uuid}.pdf
	gcsPath := fmt.Sprintf("policies/%s/%s%s", orgID, uuid.New().String(), filepath.Ext(header.Filename))
	if err := s.server.GCS.Upload(ctx, gcsPath, "application/pdf", strings.NewReader(string(pdfBytes))); err != nil {
		return nil, fmt.Errorf("upload policy to gcs: %w", err)
	}

	// Create DB record (status=pending)
	policy, err := s.repos.Policy.CreatePolicy(ctx, name, version, gcsPath, uploaderID, orgID)
	if err != nil {
		return nil, fmt.Errorf("create policy record: %w", err)
	}

	// Enqueue ingestion job
	task, err := job.NewPolicyIngestionTask(policy.ID.String(), gcsPath)
	if err != nil {
		return nil, fmt.Errorf("create ingestion task: %w", err)
	}
	if _, err := s.job.Client.Enqueue(task); err != nil {
		return nil, fmt.Errorf("enqueue ingestion task: %w", err)
	}

	return policy, nil
}

// GetPolicy returns a policy by ID. No ownership check — admin-only route.
func (s *PolicyService) GetPolicy(ctx context.Context, id uuid.UUID) (*model.Policy, error) {
	p, err := s.repos.Policy.GetPolicyByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get policy: %w", err)
	}
	return p, nil
}

// ListPolicies returns all policies for the org, ordered newest-first.
func (s *PolicyService) ListPolicies(ctx context.Context, orgID string) ([]model.Policy, error) {
	return s.repos.Policy.ListPolicies(ctx, orgID)
}

func (s *PolicyService) GetActivePolicyForJob(ctx context.Context, orgID string) (*model.Policy, error) {
	return s.repos.Policy.GetActivePolicy(ctx, orgID)
}

func (s *PolicyService) SearchRelevantPolicyChunks(
	ctx context.Context,
	policyID uuid.UUID,
	queryVector []float32,
	limit int,
) ([]model.RetrievedChunk, error) {
	return s.repos.Policy.SearchRelevantChunks(ctx, policyID, queryVector, limit)
}

func (s *PolicyService) GetPolicyChunksForJob(ctx context.Context, policyID uuid.UUID) ([]model.RetrievedChunk, error) {
	return s.repos.Policy.GetPolicyChunks(ctx, policyID)
}

func (s *PolicyService) SetPolicyJobStatus(
	ctx context.Context,
	policyID uuid.UUID,
	status model.PolicyStatus,
	chunkCount int,
) error {
	return s.repos.Policy.SetPolicyStatus(ctx, policyID, status, chunkCount)
}

func (s *PolicyService) ActivatePolicyChunks(
	ctx context.Context,
	policyID uuid.UUID,
	chunks []model.PolicyChunkInsert,
) error {
	return s.repos.Policy.ActivatePolicyWithChunks(ctx, policyID, chunks)
}

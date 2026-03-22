package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxFileSizeBytes = 10 << 20 // 10 MB

var allowedMIMETypes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"application/pdf": ".pdf",
}

type ClaimService struct {
	server *server.Server
	repos  *repository.Repositories
	job    *job.JobService
}

func NewClaimService(s *server.Server, repos *repository.Repositories) *ClaimService {
	return &ClaimService{
		server: s,
		repos:  repos,
		job:    s.Job,
	}
}

type SubmitClaimInput struct {
	UserID          string
	BusinessPurpose string
	ClaimedDate     time.Time
	ExpenseCategory model.ExpenseCategory
	File            multipart.File
	FileHeader      *multipart.FileHeader
}

// SubmitClaimOutput is the response sent to the employee after 202 Accepted.
type SubmitClaimOutput struct {
	ClaimID string `json:"claimId"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

// SubmitClaim validates, stores the receipt, persists the claim, and enqueues OCR.
func (s *ClaimService) SubmitClaim(ctx context.Context, in *SubmitClaimInput) (*SubmitClaimOutput, error) {
	log := s.server.Logger

	// --- MIME type check ---
	ext, ok := allowedMIMETypes[in.FileHeader.Header.Get("Content-Type")]
	if !ok {
		// Fall back to extension-based detection
		ext = strings.ToLower(filepath.Ext(in.FileHeader.Filename))
		validExt := false
		for _, e := range allowedMIMETypes {
			if e == ext {
				validExt = true
				break
			}
		}
		if !validExt {
			return nil, errs.NewBadRequestError(
				"unsupported file type — please upload JPG, PNG, or PDF",
				true, nil, nil, nil,
			)
		}
	}

	// --- Size check ---
	maxBytes := int64(s.server.Config.Storage.MaxFileSizeMB) << 20
	if in.FileHeader.Size > maxBytes {
		return nil, errs.NewBadRequestError(
			fmt.Sprintf("file too large — maximum allowed size is %d MB", s.server.Config.Storage.MaxFileSizeMB),
			true, nil, nil, nil,
		)
	}

	// --- Read & hash for duplicate detection ---
	fileBytes, err := io.ReadAll(in.File)
	if err != nil {
		return nil, fmt.Errorf("failed to read uploaded file: %w", err)
	}

	hash := fmt.Sprintf("%x", sha256.Sum256(fileBytes))

	// Check duplicate
	existing, err := s.repos.Claim.FindReceiptFileByHash(ctx, hash)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("duplicate check failed: %w", err)
	}
	if existing != nil {
		return nil, errs.NewBadRequestError(
			"this receipt has already been submitted",
			true, nil, nil, nil,
		)
	}

	// --- Upload to GCS ---
	mimeType := in.FileHeader.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	claimID := uuid.New()
	gcsPath := fmt.Sprintf("receipts/%s/%s%s", in.UserID, claimID.String(), ext)

	if err := s.server.GCS.Upload(ctx, gcsPath, mimeType, strings.NewReader(string(fileBytes))); err != nil {
		log.Error().Err(err).Str("gcs_path", gcsPath).Msg("GCS upload failed")
		return nil, fmt.Errorf("failed to store receipt: %w", err)
	}

	// --- Persist receipt_file ---
	rf, err := s.repos.Claim.CreateReceiptFile(ctx, &model.ReceiptFile{
		FilePath:     gcsPath,
		OriginalName: in.FileHeader.Filename,
		MimeType:     mimeType,
		SizeBytes:    in.FileHeader.Size,
		FileHash:     hash,
		GCSPath:      gcsPath,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to save receipt file record: %w", err)
	}

	// --- Persist claim ---
	claim, err := s.repos.Claim.CreateClaim(ctx, &model.Claim{
		UserID:          in.UserID,
		ReceiptFileID:   rf.ID,
		BusinessPurpose: in.BusinessPurpose,
		ClaimedDate:     in.ClaimedDate,
		ExpenseCategory: in.ExpenseCategory,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to save claim: %w", err)
	}

	// --- Enqueue OCR job ---
	ocrTask, err := job.NewOCRReceiptTask(claim.ID, gcsPath, mimeType, in.ClaimedDate)
	if err != nil {
		return nil, fmt.Errorf("failed to build OCR task: %w", err)
	}

	if _, err := s.job.Client.Enqueue(ocrTask); err != nil {
		log.Error().Err(err).Str("claim_id", claim.ID.String()).Msg("failed to enqueue OCR task")
		// Non-fatal — the claim is saved, OCR can be retried via admin
	}

	log.Info().
		Str("claim_id", claim.ID.String()).
		Str("user_id", in.UserID).
		Str("gcs_path", gcsPath).
		Msg("claim submitted, OCR queued")

	return &SubmitClaimOutput{
		ClaimID: claim.ID.String(),
		Status:  string(model.ClaimStatusPending),
		Message: "Receipt received and queued for processing",
	}, nil
}

// GetClaim returns a claim by ID, enforcing ownership.
func (s *ClaimService) GetClaim(ctx context.Context, claimID uuid.UUID, userID string) (*model.Claim, error) {
	claim, err := s.repos.Claim.GetClaimByID(ctx, claimID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errs.NewNotFoundError("claim not found", false, nil)
		}
		return nil, fmt.Errorf("failed to get claim: %w", err)
	}

	if claim.UserID != userID {
		return nil, errs.NewForbiddenError("access denied", false)
	}

	return claim, nil
}

// GetUserClaims returns all claims for the authenticated user.
func (s *ClaimService) GetUserClaims(ctx context.Context, userID string) ([]model.Claim, error) {
	claims, err := s.repos.Claim.GetClaimsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list claims: %w", err)
	}
	return claims, nil
}

// StreamReceipt downloads a receipt from GCS and streams it back.
// Enforces ownership before serving the file.
func (s *ClaimService) StreamReceipt(ctx context.Context, claimID uuid.UUID, userID string) ([]byte, string, error) {
	claim, err := s.repos.Claim.GetClaimByID(ctx, claimID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, "", errs.NewNotFoundError("claim not found", false, nil)
		}
		return nil, "", fmt.Errorf("stream receipt: get claim: %w", err)
	}

	if claim.UserID != userID {
		return nil, "", errs.NewForbiddenError("access denied", false)
	}

	rf, err := s.repos.Claim.GetReceiptFileByClaimID(ctx, claimID)
	if err != nil {
		return nil, "", fmt.Errorf("stream receipt: get receipt file: %w", err)
	}

	data, contentType, err := s.server.GCS.Download(ctx, rf.GCSPath)
	if err != nil {
		return nil, "", fmt.Errorf("stream receipt: gcs download: %w", err)
	}

	return data, contentType, nil
}

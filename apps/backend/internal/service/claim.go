package service

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/cache"
	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

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
	OrgID           string
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
		OrgID:           in.OrgID,
		ReceiptFileID:   rf.ID,
		BusinessPurpose: in.BusinessPurpose,
		ClaimedDate:     in.ClaimedDate,
		ExpenseCategory: in.ExpenseCategory,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to save claim: %w", err)
	}

	// Invalidate the user's claim list so the new claim appears immediately
	_ = cache.Del(ctx, s.server.Cache, cache.KeyClaimList(in.UserID))

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

// GetClaim returns a claim by ID, enforcing ownership. Reads from cache first.
func (s *ClaimService) GetClaim(ctx context.Context, claimID uuid.UUID, userID string) (*model.Claim, error) {
	key := cache.KeyClaim(claimID.String())
	if cached, ok, _ := cache.Get[model.Claim](ctx, s.server.Cache, key); ok {
		s.server.Logger.Debug().Str("key", key).Msg("cache hit: claim")
		if cached.UserID != userID {
			return nil, errs.NewForbiddenError("access denied", false)
		}
		return cached, nil
	}

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

	// Cache immediately before reconciliation so concurrent requests hit cache
	_ = cache.Set(ctx, s.server.Cache, key, *claim, cache.TTLClaim)

	// Reconcile policy status in background — re-caches if status changed
	go func() {
		bgCtx := context.Background()
		prev := claim.Status
		if err := s.reconcilePolicyStatus(bgCtx, claim); err != nil {
			s.server.Logger.Error().Err(err).Str("claim_id", claim.ID.String()).Msg("policy recheck failed")
			return
		}
		if claim.Status != prev {
			_ = cache.Set(bgCtx, s.server.Cache, key, *claim, cache.TTLClaim)
		}
	}()

	return claim, nil
}

// GetUserClaims returns all claims for the authenticated user. Reads from cache first.
func (s *ClaimService) GetUserClaims(ctx context.Context, userID string) ([]model.Claim, error) {
	key := cache.KeyClaimList(userID)
	if cached, ok, _ := cache.Get[[]model.Claim](ctx, s.server.Cache, key); ok {
		s.server.Logger.Debug().Str("key", key).Msg("cache hit: claim list")
		return *cached, nil
	}

	claims, err := s.repos.Claim.GetClaimsByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list claims: %w", err)
	}

	// Cache the raw DB result immediately so concurrent requests don't all hit DB
	_ = cache.Set(ctx, s.server.Cache, key, claims, cache.TTLClaimList)

	// Reconcile policy status in the background — only for claims that need it.
	// This mutates status in DB + invalidates cache if anything changed.
	go func() {
		bgCtx := context.Background()
		changed := false
		for i := range claims {
			prev := claims[i].Status
			if err := s.reconcilePolicyStatus(bgCtx, &claims[i]); err != nil {
				s.server.Logger.Error().Err(err).Str("claim_id", claims[i].ID.String()).Msg("policy recheck failed")
				continue
			}
			if claims[i].Status != prev {
				changed = true
			}
		}
		if changed {
			// Re-cache with updated statuses
			_ = cache.Set(bgCtx, s.server.Cache, key, claims, cache.TTLClaimList)
		}
	}()

	return claims, nil
}

// RecomputePolicyMatch re-runs policy retrieval + cap check for a claim.
// Admin-only route should call this; no ownership check here.
func (s *ClaimService) RecomputePolicyMatch(ctx context.Context, claimID uuid.UUID) (*model.Claim, error) {
	_, err := s.repos.Claim.GetClaimByID(ctx, claimID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errs.NewNotFoundError("claim not found", false, nil)
		}
		return nil, fmt.Errorf("get claim: %w", err)
	}

	if s.job != nil {
		if err := s.job.RecomputePolicyMatch(ctx, claimID); err != nil {
			return nil, fmt.Errorf("recompute policy match: %w", err)
		}
	}

	updated, err := s.repos.Claim.GetClaimByID(ctx, claimID)
	if err != nil {
		return nil, fmt.Errorf("get updated claim: %w", err)
	}
	return updated, nil
}

// StreamReceipt downloads a receipt from GCS and streams it back.
// Enforces ownership before serving the file.
func (s *ClaimService) StreamReceipt(ctx context.Context, claimID uuid.UUID, userID string) ([]byte, string, error) {
	claim, err := s.repos.Claim.GetClaimByID(ctx, claimID) // intentionally bypass cache — binary blob
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

func (s *ClaimService) reconcilePolicyStatus(ctx context.Context, claim *model.Claim) error {
	if claim.Status != model.ClaimStatusPolicyMatched && claim.Status != model.ClaimStatusNeedsReview {
		return nil
	}
	if claim.Amount == nil || len(claim.PolicyChunksUsed) == 0 {
		return nil
	}
	if claim.Status == model.ClaimStatusNeedsReview {
		if claim.DateMismatch || claim.OCRError != nil {
			return nil
		}
		if claim.OCRRawJSON != nil && *claim.OCRRawJSON != "" {
			var payload struct {
				Confidence float64 `json:"confidence"`
			}
			if err := json.Unmarshal([]byte(*claim.OCRRawJSON), &payload); err == nil {
				if payload.Confidence > 0 && payload.Confidence < 0.5 {
					return nil
				}
			}
		}
	}

	chunks, err := model.UnmarshalRetrievedChunks(claim.PolicyChunksUsed)
	if err != nil {
		return fmt.Errorf("parse policy chunks: %w", err)
	}
	if len(chunks) == 0 {
		return nil
	}

	mealsCap, lodgingCap := job.ExtractCapsFromChunks(chunks)
	if (mealsCap == nil || lodgingCap == nil) && claim.PolicyID != nil {
		allChunks, err := s.repos.Policy.GetPolicyChunks(ctx, *claim.PolicyID)
		if err != nil {
			return fmt.Errorf("load full policy chunks: %w", err)
		}
		allMealsCap, allLodgingCap := job.ExtractCapsFromChunks(allChunks)
		if mealsCap == nil {
			mealsCap = allMealsCap
		}
		if lodgingCap == nil {
			lodgingCap = allLodgingCap
		}
	}
	nextStatus := claim.Status
	switch claim.ExpenseCategory {
	case model.ExpenseCategoryMeals:
		if mealsCap == nil {
			nextStatus = model.ClaimStatusNeedsReview
		} else if *claim.Amount > *mealsCap {
			nextStatus = model.ClaimStatusFlagged
		} else {
			nextStatus = model.ClaimStatusPolicyMatched
		}
	case model.ExpenseCategoryLodging:
		if lodgingCap == nil {
			nextStatus = model.ClaimStatusNeedsReview
		} else if *claim.Amount > *lodgingCap {
			nextStatus = model.ClaimStatusFlagged
		} else {
			nextStatus = model.ClaimStatusPolicyMatched
		}
	}
	if nextStatus == claim.Status {
		return nil
	}

	if err := s.repos.Claim.SetStatus(ctx, claim.ID, nextStatus); err != nil {
		return fmt.Errorf("update claim status: %w", err)
	}
	claim.Status = nextStatus
	return nil
}

func (s *ClaimService) SetClaimOrgID(ctx context.Context, claimID uuid.UUID, orgID string) error {
	return s.repos.Claim.SetOrgID(ctx, claimID, orgID)
}

func (s *ClaimService) SetClaimJobStatus(ctx context.Context, claimID uuid.UUID, status model.ClaimStatus) error {
	if err := s.repos.Claim.SetStatus(ctx, claimID, status); err != nil {
		return err
	}
	s.invalidateClaimCaches(ctx, claimID)
	return nil
}

func (s *ClaimService) MarkClaimOCRFailed(ctx context.Context, claimID uuid.UUID, reason string) error {
	if err := s.repos.Claim.MarkOCRFailed(ctx, claimID, reason); err != nil {
		return err
	}
	s.invalidateClaimCaches(ctx, claimID)
	return nil
}

// invalidateClaimCaches removes the individual claim and the owner's list from Redis.
func (s *ClaimService) invalidateClaimCaches(ctx context.Context, claimID uuid.UUID) {
	keys := []string{cache.KeyClaim(claimID.String())}
	if claim, err := s.repos.Claim.GetClaimByID(ctx, claimID); err == nil {
		keys = append(keys, cache.KeyClaimList(claim.UserID))
	}
	_ = cache.Del(ctx, s.server.Cache, keys...)
}

func (s *ClaimService) SaveClaimOCRResult(
	ctx context.Context,
	claimID uuid.UUID,
	result *gemini.OCRResult,
	status model.ClaimStatus,
	dateMismatch bool,
	reviewReason *string,
) error {
	var merchantName *string
	if result.MerchantName != "" {
		merchantName = &result.MerchantName
	}
	var receiptDate *time.Time
	if result.Date != "" {
		d, err := time.Parse("2006-01-02", result.Date)
		if err == nil {
			receiptDate = &d
		}
	}
	var amount *float64
	if result.TotalAmount > 0 {
		amount = &result.TotalAmount
	}
	var currency *string
	if result.Currency != "" {
		currency = &result.Currency
	}
	var rawJSON *string
	if storedJSON, err := result.StorageJSON(); err == nil {
		rawJSON = &storedJSON
	} else if result.RawJSON != "" {
		rawJSON = &result.RawJSON
	}
	if err := s.repos.Claim.SaveOCRResult(
		ctx, claimID, status, merchantName, receiptDate, amount, currency, rawJSON, dateMismatch, reviewReason,
	); err != nil {
		return err
	}
	// Invalidate both the individual claim and the user's list (amount/status changed)
	claim, err := s.repos.Claim.GetClaimByID(ctx, claimID)
	if err == nil {
		_ = cache.Del(ctx, s.server.Cache,
			cache.KeyClaim(claimID.String()),
			cache.KeyClaimList(claim.UserID),
		)
	} else {
		_ = cache.Del(ctx, s.server.Cache, cache.KeyClaim(claimID.String()))
	}
	return nil
}

func (s *ClaimService) GetClaimForJob(ctx context.Context, claimID uuid.UUID) (*model.Claim, error) {
	return s.repos.Claim.GetClaimByID(ctx, claimID)
}

func (s *ClaimService) SaveClaimPolicyMatch(
	ctx context.Context,
	claimID uuid.UUID,
	policyID uuid.UUID,
	chunks []model.RetrievedChunk,
	status model.ClaimStatus,
) error {
	raw, err := model.MarshalRetrievedChunks(chunks)
	if err != nil {
		return err
	}
	if err := s.repos.Claim.SavePolicyMatch(ctx, claimID, policyID, raw, status); err != nil {
		return err
	}
	claim, err := s.repos.Claim.GetClaimByID(ctx, claimID)
	if err == nil {
		_ = cache.Del(ctx, s.server.Cache,
			cache.KeyClaim(claimID.String()),
			cache.KeyClaimList(claim.UserID),
		)
	} else {
		_ = cache.Del(ctx, s.server.Cache, cache.KeyClaim(claimID.String()))
	}
	return nil
}

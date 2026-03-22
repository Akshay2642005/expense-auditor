package job

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/Akshay2642005/expense-auditor/internal/lib/email"
	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
	gcslib "github.com/Akshay2642005/expense-auditor/internal/lib/storage"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/hibiken/asynq"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// package-level dependencies — initialised via Init* methods on JobService

var emailClient *email.Client

var (
	ocrGeminiClient     *gemini.Client
	ocrGCSClient        *gcslib.GCSClient
	ocrPool             *pgxpool.Pool
	ocrDateMismatchDays int
)

func (j *JobService) InitHandlers(cfg *config.Config, logger *zerolog.Logger) {
	emailClient = email.NewClient(cfg, logger)
}

// InitOCRHandlers wires the dependencies needed by the OCR job handler.
// Called from server.New() after all clients are initialised.
func (j *JobService) InitOCRHandlers(
	gc *gemini.Client,
	gs *gcslib.GCSClient,
	pool *pgxpool.Pool,
	dateMismatchDays int,
) {
	ocrGeminiClient = gc
	ocrGCSClient = gs
	ocrPool = pool
	ocrDateMismatchDays = dateMismatchDays
}

// --- email handlers ---

func (j *JobService) handleWelcomeEmailTask(ctx context.Context, t *asynq.Task) error {
	var p WelcomeEmailPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("failed to unmarshal welcome email payload: %w", err)
	}

	j.logger.Info().Str("type", "welcome").Str("to", p.To).Msg("processing welcome email task")

	if err := emailClient.SendWelcomeEmail(p.To, p.FirstName); err != nil {
		j.logger.Error().Err(err).Str("to", p.To).Msg("failed to send welcome email")
		return err
	}

	j.logger.Info().Str("to", p.To).Msg("welcome email sent successfully")
	return nil
}

// --- OCR handler ---

func (j *JobService) handleOCRReceiptTask(ctx context.Context, t *asynq.Task) error {
	var p OCRPayload
	if err := json.Unmarshal(t.Payload(), &p); err != nil {
		return fmt.Errorf("ocr: unmarshal payload: %w", err)
	}

	log := j.logger.With().Str("claim_id", p.ClaimID.String()).Logger()
	log.Info().Msg("starting OCR job")

	// Mark claim as processing
	if err := setClaimStatus(ctx, ocrPool, p.ClaimID, model.ClaimStatusProcessing); err != nil {
		log.Error().Err(err).Msg("failed to set status=processing")
		return err
	}

	// Download file bytes from GCS
	imageData, mimeType, err := ocrGCSClient.Download(ctx, p.GCSPath)
	if err != nil {
		log.Error().Err(err).Msg("failed to download receipt from GCS")
		_ = failClaim(ctx, ocrPool, p.ClaimID, "failed to read uploaded file")
		return fmt.Errorf("ocr: gcs download: %w", err)
	}
	if p.MimeType != "" {
		mimeType = p.MimeType
	}

	// Call Gemini OCR
	result, err := ocrGeminiClient.ExtractReceiptData(ctx, imageData, mimeType)
	if err != nil {
		log.Error().Err(err).Msg("gemini OCR failed")
		_ = failClaim(ctx, ocrPool, p.ClaimID, fmt.Sprintf("OCR failed: %s", err.Error()))
		return fmt.Errorf("ocr: gemini extract: %w", err)
	}

	log.Info().
		Str("merchant", result.MerchantName).
		Str("date", result.Date).
		Float64("amount", result.TotalAmount).
		Str("currency", result.Currency).
		Float64("confidence", result.Confidence).
		Msg("OCR extraction complete")

	// --- deterministic validation ---

	status := model.ClaimStatusOCRComplete

	// Low confidence → needs manual review
	if result.Confidence < 0.5 {
		status = model.ClaimStatusNeedsReview
	}

	// Date mismatch check
	dateMismatch := false
	claimedDate, parseErr := time.Parse(time.RFC3339, p.ClaimedDate)
	if parseErr == nil && result.Date != "" {
		receiptDate, dateErr := time.Parse("2006-01-02", result.Date)
		if dateErr == nil {
			diff := claimedDate.Sub(receiptDate)
			diffDays := math.Abs(diff.Hours() / 24)
			threshold := float64(ocrDateMismatchDays)
			if threshold == 0 {
				threshold = 7
			}
			if diffDays > threshold {
				dateMismatch = true
				status = model.ClaimStatusNeedsReview
			}
		}
	}

	if err := saveOCRResult(ctx, ocrPool, p.ClaimID, result, status, dateMismatch); err != nil {
		log.Error().Err(err).Msg("failed to save OCR result")
		return fmt.Errorf("ocr: save result: %w", err)
	}

	log.Info().Str("status", string(status)).Bool("date_mismatch", dateMismatch).Msg("OCR job complete")
	return nil
}

// --- DB helpers (direct SQL; avoids circular imports with repository package) ---

func setClaimStatus(ctx context.Context, pool *pgxpool.Pool, claimID interface{ String() string }, status model.ClaimStatus) error {
	_, err := pool.Exec(ctx,
		`UPDATE claims SET status = $1, updated_at = now() WHERE id = $2`,
		string(status), claimID.String(),
	)
	return err
}

func failClaim(ctx context.Context, pool *pgxpool.Pool, claimID interface{ String() string }, reason string) error {
	_, err := pool.Exec(ctx,
		`UPDATE claims SET status = $1, ocr_error = $2, updated_at = now() WHERE id = $3`,
		string(model.ClaimStatusOCRFailed), reason, claimID.String(),
	)
	return err
}

func saveOCRResult(
	ctx context.Context,
	pool *pgxpool.Pool,
	claimID interface{ String() string },
	result *gemini.OCRResult,
	status model.ClaimStatus,
	dateMismatch bool,
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
	if result.RawJSON != "" {
		rawJSON = &result.RawJSON
	}

	_, err := pool.Exec(ctx, `
		UPDATE claims SET
			status        = $1,
			merchant_name = $2,
			receipt_date  = $3,
			amount        = $4,
			currency      = $5,
			ocr_raw_json  = $6::jsonb,
			date_mismatch = $7,
			updated_at    = now()
		WHERE id = $8
	`, string(status), merchantName, receiptDate, amount, currency, rawJSON, dateMismatch, claimID.String())

	return err
}

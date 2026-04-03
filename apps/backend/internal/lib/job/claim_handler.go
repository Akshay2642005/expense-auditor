package job

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/hibiken/asynq"
)

func (j *JobService) handleOCRReceiptTask(ctx context.Context, t *asynq.Task) error {
	var payload OCRPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("unmarshal ocr payload: %w", err)
	}

	claimID := payload.ClaimID
	log := j.logger.With().Str("claim_id", claimID.String()).Logger()

	if err := j.claimService.SetClaimJobStatus(ctx, claimID, model.ClaimStatusProcessing); err != nil {
		log.Error().Err(err).Msg("failed to set status=processing")
		return err
	}

	fileBytes, mimeType, err := ocrGCSClient.Download(ctx, payload.GCSPath)
	if err != nil {
		log.Error().Err(err).Msg("failed to download receipt from gcs")
		_ = j.claimService.MarkClaimOCRFailed(ctx, claimID, "failed to read uploaded file")
		return fmt.Errorf("ocr: gcs download: %w", err)
	}

	result, err := ocrGeminiClient.ExtractReceiptData(ctx, fileBytes, mimeType)
	if err != nil {
		log.Error().Err(err).Msg("gemini OCR failed")
		_ = j.claimService.MarkClaimOCRFailed(ctx, claimID, fmt.Sprintf("OCR failed: %v", err))
		return fmt.Errorf("ocr: gemini extract: %w", err)
	}

	claim, err := j.claimService.GetClaimForJob(ctx, claimID)
	if err != nil {
		log.Error().Err(err).Msg("failed to load claim for OCR verification")
		return fmt.Errorf("ocr: load claim: %w", err)
	}

	status := model.ClaimStatusOCRComplete
	if result.Confidence < 0.5 {
		status = model.ClaimStatusNeedsReview
	}

	dateMismatch := false
	var reviewReason *string
	claimedDate, parseErr := time.Parse(time.RFC3339, payload.ClaimedDate)
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

	check, err := ocrGeminiClient.AssessBusinessPurposeConsistency(
		ctx,
		claim.BusinessPurpose,
		string(claim.ExpenseCategory),
		result.MerchantName,
		strconv.FormatFloat(result.TotalAmount, 'f', -1, 64),
		result.Currency,
		result.Date,
	)
	if err != nil {
		log.Warn().Err(err).Msg("business purpose consistency check failed")
	} else {
		result.BusinessPurposeCheck = check
		log.Info().
			Str("business_purpose_verdict", check.Verdict).
			Float64("business_purpose_confidence", check.Confidence).
			Msg("business purpose consistency evaluated")

		if shouldReviewBusinessPurposeMismatch(check) {
			status = model.ClaimStatusNeedsReview
			reason := check.Reason
			reviewReason = &reason
			log.Warn().Msg("business purpose mismatch detected; marking claim for review")
		}
	}

	if err := j.claimService.SaveClaimOCRResult(ctx, claimID, result, status, dateMismatch, reviewReason); err != nil {
		log.Error().Err(err).Msg("failed to save OCR result")
		return err
	}

	policyErr := j.retrieveAndSavePolicy(ctx, claimID)
	if policyErr != nil {
		log.Warn().Err(policyErr).Msg("policy retrieval failed; claim remains at OCR terminal status")
	}

	return nil
}

func shouldReviewBusinessPurposeMismatch(check *gemini.BusinessPurposeCheck) bool {
	return check != nil && check.Verdict == "mismatch" && check.Confidence >= 0.7
}

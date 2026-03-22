package job

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

const TaskOCRReceipt = "receipt:ocr"

type OCRPayload struct {
	ClaimID     uuid.UUID `json:"claim_id"`
	GCSPath     string    `json:"gcs_path"`
	MimeType    string    `json:"mime_type"`
	ClaimedDate string    `json:"claimed_date"` // RFC3339 format
}

func NewOCRReceiptTask(
	claimID uuid.UUID, gcsPath, mimeType string,
	claimedDate time.Time,
) (*asynq.Task, error) {
	payload, err := json.Marshal(OCRPayload{
		ClaimID:     claimID,
		GCSPath:     gcsPath,
		MimeType:    mimeType,
		ClaimedDate: claimedDate.Format(time.RFC3339),
	})
	if err != nil {
		return nil, err
	}

	return asynq.NewTask(
		TaskOCRReceipt,
		payload,
		asynq.MaxRetry(3),
		asynq.Queue("critical"),
		asynq.Timeout(90*time.Second),
	), nil
}

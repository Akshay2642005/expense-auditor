package job

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

const TaskAuditClaim = "claim:audit"

type AuditPayload struct {
	ClaimID uuid.UUID `json:"claim_id"`
}

func NewAuditClaimTask(claimID uuid.UUID) (*asynq.Task, error) {
	payload, err := json.Marshal(AuditPayload{ClaimID: claimID})
	if err != nil {
		return nil, err
	}

	return asynq.NewTask(
		TaskAuditClaim,
		payload,
		asynq.MaxRetry(3),
		asynq.Queue("default"),
		asynq.Timeout(120*time.Second),
	), nil
}

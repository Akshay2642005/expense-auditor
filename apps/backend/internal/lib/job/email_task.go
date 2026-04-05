package job

import (
	"encoding/json"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/google/uuid"
	"github.com/hibiken/asynq"
)

const (
	TaskWelcome      = "email:welcome"
	TaskClaimOutcome = "email:claim-outcome"
)

type WelcomeEmailPayload struct {
	To        string `json:"to"`
	FirstName string `json:"first_name"`
}

type ClaimOutcomeEmailPayload struct {
	ClaimID uuid.UUID         `json:"claim_id"`
	Status  model.ClaimStatus `json:"status"`
	Reason  string            `json:"reason"`
}

func NewWelcomeEmailTask(to, firstName string) (*asynq.Task, error) {
	payload, err := json.Marshal(WelcomeEmailPayload{
		To:        to,
		FirstName: firstName,
	})
	if err != nil {
		return nil, err
	}

	return asynq.NewTask(TaskWelcome, payload,
		asynq.MaxRetry(3),
		asynq.Queue("email"),
		asynq.Timeout(30*time.Second)), nil
}

func NewClaimOutcomeEmailTask(
	claimID uuid.UUID,
	status model.ClaimStatus,
	reason string,
) (*asynq.Task, error) {
	payload, err := json.Marshal(ClaimOutcomeEmailPayload{
		ClaimID: claimID,
		Status:  status,
		Reason:  reason,
	})
	if err != nil {
		return nil, err
	}

	return asynq.NewTask(TaskClaimOutcome, payload,
		asynq.MaxRetry(3),
		asynq.Queue("email"),
		asynq.Timeout(30*time.Second)), nil
}

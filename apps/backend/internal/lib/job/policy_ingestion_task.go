package job

import (
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"
)

const TaskPolicyIngestion = "policy:ingestion"

type PolicyIngestionPayload struct {
	PolicyID string `json:"policy_id"`
	GCSPath  string `json:"gcs_path"`
}

func NewPolicyIngestionTask(policyID, gcsPath string) (*asynq.Task, error) {
	payload, err := json.Marshal(PolicyIngestionPayload{
		PolicyID: policyID,
		GCSPath:  gcsPath,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal policy ingestion payload: %w", err)
	}
	return asynq.NewTask(TaskPolicyIngestion, payload), nil
}

package model

import (
	"encoding/json"

	"github.com/google/uuid"
)

type PolicyStatus string

const (
	PolicyStatusPending   PolicyStatus = "pending"
	PolicyStatusIngesting PolicyStatus = "ingesting"
	PolicyStatusActive    PolicyStatus = "active"
	PolicyStatusFailed    PolicyStatus = "failed"
	PolicyStatusArchived  PolicyStatus = "archived"
)

type Policy struct {
	Base
	Name       string       `json:"name"       db:"name"`
	GCSPath    string       `json:"gcsPath"    db:"gcs_path"`
	Version    string       `json:"version"    db:"version"`
	Status     PolicyStatus `json:"status"     db:"status"`
	ChunkCount int          `json:"chunkCount" db:"chunk_count"`
	UploadedBy string       `json:"uploadedBy" db:"uploaded_by"`
	OrgID      string       `json:"orgId"      db:"org_id"`
}

type PolicyChunk struct {
	Base
	Policy     uuid.UUID `db:"policy_id"`
	ChunkText  string    `db:"chunk_text"`
	Category   string    `db:"category"`
	PageNum    int       `db:"page_num"`
	ChunkIndex int       `db:"chunk_index"`
}

type PolicyChunkInsert struct {
	PolicyID   uuid.UUID
	ChunkText  string
	Embedding  []float32
	Category   string
	PageNum    int
	ChunkIndex int
}

type RetrievedChunk struct {
	ChunkText string  `json:"chunk_text"`
	Category  string  `json:"category"`
	PageNum   int     `json:"page_num"`
	Score     float64 `json:"score"`
}

func MarshalRetrievedChunks(chunks []RetrievedChunk) ([]byte, error) {
	return json.Marshal(chunks)
}

func UnmarshalRetrievedChunks(raw []byte) ([]RetrievedChunk, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var chunks []RetrievedChunk
	if err := json.Unmarshal(raw, &chunks); err != nil {
		return nil, err
	}
	return chunks, nil
}

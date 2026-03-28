package repository

import (
	"context"
	"fmt"

	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	pgvector "github.com/pgvector/pgvector-go"
)

type PolicyRepository struct {
	db *pgxpool.Pool
}

func NewPolicyRepository(db *pgxpool.Pool) *PolicyRepository {
	return &PolicyRepository{db: db}
}

func (r *PolicyRepository) CreatePolicy(
	ctx context.Context,
	name, version, gcsPath, uploadedBy, orgID string,
) (*model.Policy, error) {
	const query = `
		INSERT INTO policies (name, version, gcs_path, uploaded_by, org_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, name, gcs_path, version, status, chunk_count, uploaded_by, org_id, created_at, updated_at
	`
	rows, err := r.db.Query(ctx, query, name, version, gcsPath, uploadedBy, orgID)
	if err != nil {
		return nil, fmt.Errorf("Error inserting policy: %w", err)
	}
	p, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Policy])
	if err != nil {
		return nil, fmt.Errorf("Error collecting inserted policy: %w", err)
	}
	return &p, nil
}

func (r *PolicyRepository) GetPolicyByID(
	ctx context.Context,
	id uuid.UUID,
) (*model.Policy, error) {
	const query = `
		SELECT id, name, gcs_path, version, status, chunk_count, uploaded_by, org_id, created_at, updated_at
		FROM policies WHERE id = $1
	`
	rows, err := r.db.Query(ctx, query, id)
	if err != nil {
		return nil, fmt.Errorf("Error querying policy by ID: %w", err)
	}
	p, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Policy])
	if err != nil {
		return nil, fmt.Errorf("Error collecting policy by ID: %w", err)
	}
	return &p, nil
}

func (r *PolicyRepository) GetActivePolicy(
	ctx context.Context,
	orgID string,
) (*model.Policy, error) {
	const query = `
		SELECT id, name, gcs_path, version, status, chunk_count, uploaded_by, org_id, created_at, updated_at
		FROM policies WHERE status = 'active' AND org_id = $1
		ORDER by created_at DESC
		LIMIT 1
	`
	rows, err := r.db.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("Error querying active policy: %w", err)
	}
	p, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Policy])
	if err != nil {
		return nil, fmt.Errorf("Error collecting active policy: %w", err)
	}
	return &p, nil
}

func (r *PolicyRepository) ListPolicies(
	ctx context.Context,
	orgID string,
) ([]model.Policy, error) {
	const query = `
		SELECT id, name, gcs_path, version, status, chunk_count, uploaded_by, org_id, created_at, updated_at
		FROM policies
		WHERE org_id = $1
		ORDER by created_at DESC
	`
	rows, err := r.db.Query(ctx, query, orgID)
	if err != nil {
		return nil, fmt.Errorf("Error querying policies: %w", err)
	}

	policies, err := pgx.CollectRows(rows, pgx.RowToStructByNameLax[model.Policy])
	if err != nil {
		return nil, fmt.Errorf("Error collecting policies: %w", err)
	}
	return policies, nil
}

func (r *PolicyRepository) SetPolicyStatus(ctx context.Context, id uuid.UUID, status model.PolicyStatus, chunkCount int) error {
	var err error
	if chunkCount >= 0 {
		_, err = r.db.Exec(ctx,
			`UPDATE policies SET status = $1, chunk_count = $2 WHERE id = $3`,
			status, chunkCount, id)
	} else {
		_, err = r.db.Exec(ctx,
			`UPDATE policies SET status = $1 WHERE id = $2`,
			status, id)
	}
	if err != nil {
		return fmt.Errorf("set policy status: %w", err)
	}
	return nil
}

func (r *PolicyRepository) ArchiveActivePolicies(ctx context.Context, orgID string) error {
	_, err := r.db.Exec(ctx, `UPDATE policies SET status = 'archived' WHERE status = 'active' AND org_id = $1`, orgID)
	if err != nil {
		return fmt.Errorf("archive active policies: %w", err)
	}
	return nil
}

func (r *PolicyRepository) BulkInsertChunks(ctx context.Context, chunks []model.PolicyChunkInsert) error {
	if len(chunks) == 0 {
		return nil
	}

	cols := []string{"policy_id", "chunk_text", "embedding", "category", "page_num", "chunk_index"}

	_, err := r.db.CopyFrom(
		ctx,
		pgx.Identifier{"policy_chunks"},
		cols,
		pgx.CopyFromSlice(len(chunks), func(i int) ([]any, error) {
			return []any{
				chunks[i].PolicyID,
				chunks[i].ChunkText,
				pgvector.NewVector(chunks[i].Embedding),
				chunks[i].Category,
				chunks[i].PageNum,
				chunks[i].ChunkIndex,
			}, nil
		}),
	)
	if err != nil {
		return fmt.Errorf("bulk insert chunks: %w", err)
	}
	return nil
}

func (r *PolicyRepository) SearchRelevantChunks(
	ctx context.Context,
	policyID uuid.UUID,
	queryVector []float32,
	limit int,
) ([]model.RetrievedChunk, error) {
	rows, err := r.db.Query(ctx, `
		SELECT chunk_text, category, page_num,
		       1 - (embedding <=> $1::vector) AS score
		FROM policy_chunks
		WHERE policy_id = $2
		ORDER BY embedding <=> $1::vector
		LIMIT $3`,
		pgvector.NewVector(queryVector), policyID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("search relevant chunks: %w", err)
	}

	retrieved, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (model.RetrievedChunk, error) {
		var chunk model.RetrievedChunk
		err := row.Scan(&chunk.ChunkText, &chunk.Category, &chunk.PageNum, &chunk.Score)
		return chunk, err
	})
	if err != nil {
		return nil, fmt.Errorf("collect relevant chunks: %w", err)
	}

	return retrieved, nil
}

func (r *PolicyRepository) GetPolicyChunks(ctx context.Context, policyID uuid.UUID) ([]model.RetrievedChunk, error) {
	rows, err := r.db.Query(ctx, `
		SELECT chunk_text, category, page_num
		FROM policy_chunks
		WHERE policy_id = $1
	`, policyID)
	if err != nil {
		return nil, fmt.Errorf("get policy chunks: %w", err)
	}

	chunks, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (model.RetrievedChunk, error) {
		var chunk model.RetrievedChunk
		err := row.Scan(&chunk.ChunkText, &chunk.Category, &chunk.PageNum)
		return chunk, err
	})
	if err != nil {
		return nil, fmt.Errorf("collect policy chunks: %w", err)
	}

	return chunks, nil
}

func (r *PolicyRepository) ActivatePolicyWithChunks(ctx context.Context, policyID uuid.UUID, chunks []model.PolicyChunkInsert) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin policy activation tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx,
		`UPDATE policies SET status = 'archived' WHERE status = 'active' AND id != $1 AND org_id = (SELECT org_id FROM policies WHERE id = $1)`,
		policyID,
	); err != nil {
		return fmt.Errorf("archive active policies: %w", err)
	}

	for _, chunk := range chunks {
		if _, err := tx.Exec(ctx,
			`INSERT INTO policy_chunks (policy_id, chunk_text, embedding, category, page_num, chunk_index)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			chunk.PolicyID,
			chunk.ChunkText,
			pgvector.NewVector(chunk.Embedding),
			chunk.Category,
			chunk.PageNum,
			chunk.ChunkIndex,
		); err != nil {
			return fmt.Errorf("insert policy chunk: %w", err)
		}
	}

	if _, err := tx.Exec(ctx,
		`UPDATE policies SET status = 'active', chunk_count = $1 WHERE id = $2`,
		len(chunks), policyID,
	); err != nil {
		return fmt.Errorf("activate policy: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit policy activation: %w", err)
	}

	return nil
}

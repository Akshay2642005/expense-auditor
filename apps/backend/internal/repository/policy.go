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

package repository

import (
	"context"
	"fmt"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type ClaimRepository struct {
	db *pgxpool.Pool
}

func NewClaimRepository(db *pgxpool.Pool) *ClaimRepository {
	return &ClaimRepository{db: db}
}

func (r *ClaimRepository) CreateReceiptFile(
	ctx context.Context, rf *model.ReceiptFile,
) (*model.ReceiptFile, error) {
	const query = `
		INSERT INTO receipt_files (file_path, original_name, mime_type, size_bytes, file_hash, gcs_path)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, file_path, original_name, mime_type, size_bytes, file_hash, gcs_path, created_at, updated_at
	`
	rows, err := r.db.Query(ctx, query, rf.FilePath, rf.OriginalName, rf.MimeType, rf.SizeBytes, rf.FileHash, rf.GCSPath)
	if err != nil {
		return nil, fmt.Errorf("failed to insert receipt file: %w", err)
	}
	created, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.ReceiptFile])
	if err != nil {
		return nil, fmt.Errorf("failed to collect inserted receipt file: %w", err)
	}
	return &created, nil
}

func (r *ClaimRepository) CreateClaim(ctx context.Context, c *model.Claim) (*model.Claim, error) {
	rows, err := r.db.Query(ctx, `
		INSERT INTO claims (user_id, org_id, receipt_file_id, business_purpose, claimed_date, expense_category)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING
			id, user_id, org_id, receipt_file_id, business_purpose, claimed_date, expense_category,
			status, merchant_name, receipt_date, amount, currency,
			ocr_raw_json::text AS ocr_raw_json,
			date_mismatch, ocr_error, created_at, updated_at
	`, c.UserID, c.OrgID, c.ReceiptFileID, c.BusinessPurpose, c.ClaimedDate, string(c.ExpenseCategory))
	if err != nil {
		return nil, fmt.Errorf("create claim: %w", err)
	}

	created, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Claim])
	if err != nil {
		return nil, fmt.Errorf("collect claim: %w", err)
	}

	return &created, nil
}

// FindReceiptFileByHash returns a receipt_file if one with the given SHA-256 hash exists.
func (r *ClaimRepository) FindReceiptFileByHash(ctx context.Context, hash string) (*model.ReceiptFile, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, file_path, original_name, mime_type, size_bytes, file_hash, gcs_path, created_at
		FROM receipt_files
		WHERE file_hash = $1
		LIMIT 1
	`, hash)
	if err != nil {
		return nil, fmt.Errorf("find receipt by hash: %w", err)
	}

	rf, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.ReceiptFile])
	if err != nil {
		return nil, err // callers check pgx.ErrNoRows
	}

	return &rf, nil
}

// GetClaimByID fetches a single claim by its UUID.
func (r *ClaimRepository) GetClaimByID(ctx context.Context, id uuid.UUID) (*model.Claim, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id, user_id, org_id, receipt_file_id, business_purpose, claimed_date, expense_category,
			status, merchant_name, receipt_date, amount, currency,
			ocr_raw_json::text AS ocr_raw_json,
			date_mismatch, ocr_error, created_at, updated_at,
			policy_id, policy_chunks_used::text AS policy_chunks_used
		FROM claims
		WHERE id = $1
	`, id)
	if err != nil {
		return nil, fmt.Errorf("get claim by id: %w", err)
	}

	claim, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.Claim])
	if err != nil {
		return nil, err // callers check pgx.ErrNoRows
	}

	return &claim, nil
}

// GetClaimsByUserID returns all claims for a given Clerk user ID, newest first.
func (r *ClaimRepository) GetClaimsByUserID(ctx context.Context, userID string) ([]model.Claim, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			id, user_id, org_id, receipt_file_id, business_purpose, claimed_date, expense_category,
			status, merchant_name, receipt_date, amount, currency,
			ocr_raw_json::text AS ocr_raw_json,
			date_mismatch, ocr_error, created_at, updated_at,
			policy_id, policy_chunks_used::text AS policy_chunks_used
		FROM claims
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("get claims by user: %w", err)
	}

	claims, err := pgx.CollectRows(rows, pgx.RowToStructByNameLax[model.Claim])
	if err != nil {
		return nil, fmt.Errorf("collect claims: %w", err)
	}

	return claims, nil
}

// GetReceiptFileByClaimID returns the receipt_file linked to a claim.
func (r *ClaimRepository) GetReceiptFileByClaimID(ctx context.Context, claimID uuid.UUID) (*model.ReceiptFile, error) {
	rows, err := r.db.Query(ctx, `
		SELECT rf.id, rf.file_path, rf.original_name, rf.mime_type,rf.size_bytes, rf.file_hash, rf.gcs_path, rf.created_at, rf.updated_at
		FROM receipt_files rf
		JOIN claims c ON c.receipt_file_id = rf.id
		WHERE c.id = $1
	`, claimID)
	if err != nil {
		return nil, fmt.Errorf("get receipt by claim: %w", err)
	}

	rf, err := pgx.CollectOneRow(rows, pgx.RowToStructByNameLax[model.ReceiptFile])
	if err != nil {
		return nil, err
	}

	return &rf, nil
}

func (r *ClaimRepository) SetStatus(ctx context.Context, claimID uuid.UUID, status model.ClaimStatus) error {
	_, err := r.db.Exec(ctx, `UPDATE claims SET status = $1, updated_at = now() WHERE id = $2`, status, claimID)
	if err != nil {
		return fmt.Errorf("set claim status: %w", err)
	}
	return nil
}

func (r *ClaimRepository) SetOrgID(ctx context.Context, claimID uuid.UUID, orgID string) error {
	_, err := r.db.Exec(ctx, `UPDATE claims SET org_id = $1, updated_at = now() WHERE id = $2`, orgID, claimID)
	if err != nil {
		return fmt.Errorf("set claim org_id: %w", err)
	}
	return nil
}

func (r *ClaimRepository) MarkOCRFailed(ctx context.Context, claimID uuid.UUID, reason string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE claims SET status = 'ocr_failed', ocr_error = $1, updated_at = now() WHERE id = $2`,
		reason, claimID,
	)
	if err != nil {
		return fmt.Errorf("mark ocr failed: %w", err)
	}
	return nil
}

func (r *ClaimRepository) SaveOCRResult(
	ctx context.Context,
	claimID uuid.UUID,
	status model.ClaimStatus,
	merchantName *string,
	receiptDate *time.Time,
	amount *float64,
	currency *string,
	rawJSON *string,
	dateMismatch bool,
) error {
	_, err := r.db.Exec(ctx, `
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
	`, string(status), merchantName, receiptDate, amount, currency, rawJSON, dateMismatch, claimID)
	if err != nil {
		return fmt.Errorf("save ocr result: %w", err)
	}
	return nil
}

func (r *ClaimRepository) SavePolicyMatch(
	ctx context.Context,
	claimID uuid.UUID,
	policyID uuid.UUID,
	policyChunksUsed []byte,
	status model.ClaimStatus,
) error {
	_, err := r.db.Exec(ctx, `
		UPDATE claims
		SET status             = $4,
		    policy_id          = $1,
		    policy_chunks_used = $2,
		    updated_at         = now()
		WHERE id = $3
	`, policyID, policyChunksUsed, claimID, status)
	if err != nil {
		return fmt.Errorf("save policy match: %w", err)
	}
	return nil
}

func (r *ClaimRepository) GetClaimOwnerUserID(ctx context.Context, claimID uuid.UUID) (string, error) {
	var ownerUserID string
	err := r.db.QueryRow(ctx,
		`SELECT user_id FROM claims WHERE id = $1`, claimID,
	).Scan(&ownerUserID)
	if err != nil {
		return "", fmt.Errorf("get claim owner: %w", err)
	}
	return ownerUserID, nil
}

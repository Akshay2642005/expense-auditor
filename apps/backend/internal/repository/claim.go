package repository

import (
	"context"
	"fmt"

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

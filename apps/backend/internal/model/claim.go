package model

import (
	"time"

	"github.com/google/uuid"
)

type ClaimStatus string
type ExpenseCategory string

const (
	ClaimStatusPending       ClaimStatus = "pending"
	ClaimStatusProcessing    ClaimStatus = "processing"
	ClaimStatusOCRComplete   ClaimStatus = "ocr_complete"
	ClaimStatusNeedsReview   ClaimStatus = "needs_review"
	ClaimStatusOCRFailed     ClaimStatus = "ocr_failed"
	ClaimStatusPolicyMatched ClaimStatus = "policy_matched"
	ClaimStatusAuditing      ClaimStatus = "auditing"
	ClaimStatusApproved      ClaimStatus = "approved"
	ClaimStatusFlagged       ClaimStatus = "flagged"
	ClaimStatusRejected      ClaimStatus = "rejected"
)
const (
	ExpenseCategoryMeals     ExpenseCategory = "meals"
	ExpenseCategoryTransport ExpenseCategory = "transport"
	ExpenseCategoryLodging   ExpenseCategory = "lodging"
	ExpenseCategoryOther     ExpenseCategory = "other"
)

type ReceiptFile struct {
	Base
	FilePath     string `json:"filePath" db:"file_path"`
	OriginalName string `json:"originalName" db:"original_name"`
	MimeType     string `json:"mimeType" db:"mime_type"`
	SizeBytes    int64  `json:"sizeBytes" db:"size_bytes"`
	FileHash     string `json:"fileHash" db:"file_hash"`
	GCSPath      string `json:"gcsPath" db:"gcs_path"`
}

type Claim struct {
	Base
	UserID          string          `json:"userId"          db:"user_id"`
	OrgID           string          `json:"orgId"           db:"org_id"`
	SubmittedByRole string          `json:"submittedByRole" db:"submitted_by_role"`
	ReceiptFileID   uuid.UUID       `json:"receiptFileId"   db:"receipt_file_id"`
	BusinessPurpose string          `json:"businessPurpose" db:"business_purpose"`
	ClaimedDate     time.Time       `json:"claimedDate"     db:"claimed_date"`
	ExpenseCategory ExpenseCategory `json:"expenseCategory" db:"expense_category"`
	Status          ClaimStatus     `json:"status"          db:"status"`
	// OCR-extracted fields — nullable until OCR runs
	MerchantName *string    `json:"merchantName,omitempty" db:"merchant_name"`
	ReceiptDate  *time.Time `json:"receiptDate,omitempty"  db:"receipt_date"`
	Amount       *float64   `json:"amount,omitempty"       db:"amount"`
	Currency     *string    `json:"currency,omitempty"     db:"currency"`
	OCRRawJSON   *string    `json:"ocrRawJson,omitempty"   db:"ocr_raw_json"`
	DateMismatch bool       `json:"dateMismatch"           db:"date_mismatch"`
	OCRError     *string    `json:"ocrError,omitempty"     db:"ocr_error"`

	PolicyID         *uuid.UUID `db:"policy_id"`
	PolicyChunksUsed []byte     `db:"policy_chunks_used"`
}

package handler

import (
	"net/http"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/Akshay2642005/expense-auditor/internal/service"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

// ClaimHandler groups all expense-claim HTTP handlers.
type ClaimHandler struct {
	Handler
	claimService *service.ClaimService
}

func NewClaimHandler(s *server.Server, claimService *service.ClaimService) *ClaimHandler {
	return &ClaimHandler{
		Handler:      NewHandler(s),
		claimService: claimService,
	}
}

// --- POST /api/v1/claims ---

// SubmitClaimRequest is bound from multipart/form-data fields.
type SubmitClaimRequest struct {
	BusinessPurpose string `form:"business_purpose"`
	ClaimedDate     string `form:"claimed_date"`     // YYYY-MM-DD
	ExpenseCategory string `form:"expense_category"` // meals|transport|lodging|other
}

func (r *SubmitClaimRequest) Validate() error {
	type rule struct {
		field string
		check bool
		msg   string
	}
	rules := []rule{
		{"business_purpose", r.BusinessPurpose == "", "business_purpose is required"},
		{"business_purpose", len(r.BusinessPurpose) < 10, "business_purpose must be at least 10 characters"},
		{"business_purpose", len(r.BusinessPurpose) > 500, "business_purpose must not exceed 500 characters"},
		{"claimed_date", r.ClaimedDate == "", "claimed_date is required"},
		{"expense_category", r.ExpenseCategory == "", "expense_category is required"},
	}

	for _, rl := range rules {
		if rl.check {
			return errs.NewBadRequestError(rl.msg, true, nil, nil, nil)
		}
	}

	validCategories := map[string]bool{
		"meals": true, "transport": true, "lodging": true, "other": true,
	}
	if !validCategories[r.ExpenseCategory] {
		return errs.NewBadRequestError(
			"expense_category must be one of: meals, transport, lodging, other",
			true, nil, nil, nil,
		)
	}

	if _, err := time.Parse("2006-01-02", r.ClaimedDate); err != nil {
		return errs.NewBadRequestError("claimed_date must be in YYYY-MM-DD format", true, nil, nil, nil)
	}

	return nil
}

// SubmitClaim handles POST /api/v1/claims (multipart/form-data).
// It intentionally does NOT use the Handle[] wrapper because file upload
// requires manual multipart handling.
func (h *ClaimHandler) SubmitClaim(c echo.Context) error {
	log := middleware.GetLogger(c)

	userID := middleware.GetUserID(c)
	if userID == "" {
		return errs.NewUnauthorizedError("unauthorized", false)
	}

	// Bind form fields
	req := &SubmitClaimRequest{}
	if err := c.Bind(req); err != nil {
		log.Error().Err(err).Msg("failed to bind claim form")
		return errs.NewBadRequestError("invalid form data", false, nil, nil, nil)
	}
	if err := req.Validate(); err != nil {
		return err
	}

	// Parse date
	claimedDate, _ := time.Parse("2006-01-02", req.ClaimedDate) // already validated above

	// Get file
	fileHeader, err := c.FormFile("file")
	if err != nil {
		return errs.NewBadRequestError("file is required — attach a JPG, PNG, or PDF receipt", true, nil, nil, nil)
	}

	file, err := fileHeader.Open()
	if err != nil {
		return errs.NewBadRequestError("failed to open uploaded file", false, nil, nil, nil)
	}
	defer file.Close()

	out, err := h.claimService.SubmitClaim(c.Request().Context(), &service.SubmitClaimInput{
		UserID:          userID,
		OrgID:           middleware.GetOrgID(c),
		BusinessPurpose: req.BusinessPurpose,
		ClaimedDate:     claimedDate,
		ExpenseCategory: model.ExpenseCategory(req.ExpenseCategory),
		File:            file,
		FileHeader:      fileHeader,
	})
	if err != nil {
		return err
	}

	return c.JSON(http.StatusAccepted, out)
}

// --- GET /api/v1/claims ---

type ListClaimsRequest struct{}

func (r *ListClaimsRequest) Validate() error { return nil }

func (h *ClaimHandler) ListClaims(c echo.Context, _ *ListClaimsRequest) (any, error) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return nil, errs.NewUnauthorizedError("unauthorized", false)
	}

	claims, err := h.claimService.GetUserClaims(c.Request().Context(), userID)
	if err != nil {
		return nil, err
	}

	return claims, nil
}

// --- GET /api/v1/claims/:id ---

type GetClaimRequest struct {
	ID string `param:"id"`
}

func (r *GetClaimRequest) Validate() error {
	if r.ID == "" {
		return errs.NewBadRequestError("id is required", true, nil, nil, nil)
	}
	if _, err := uuid.Parse(r.ID); err != nil {
		return errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}
	return nil
}

func (h *ClaimHandler) GetClaim(c echo.Context, req *GetClaimRequest) (any, error) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return nil, errs.NewUnauthorizedError("unauthorized", false)
	}

	id, _ := uuid.Parse(req.ID) // already validated
	return h.claimService.GetClaim(c.Request().Context(), id, userID)
}

// --- GET /api/v1/claims/:id/receipt ---

type GetReceiptRequest struct {
	ID string `param:"id"`
}

func (r *GetReceiptRequest) Validate() error {
	if r.ID == "" {
		return errs.NewBadRequestError("id is required", true, nil, nil, nil)
	}
	if _, err := uuid.Parse(r.ID); err != nil {
		return errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}
	return nil
}

func (h *ClaimHandler) GetReceipt(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return errs.NewUnauthorizedError("unauthorized", false)
	}

	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		return errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}

	data, contentType, err := h.claimService.StreamReceipt(c.Request().Context(), id, userID)
	if err != nil {
		return err
	}

	return c.Blob(http.StatusOK, contentType, data)
}

// --- POST /api/v1/admin/claims/:id/recompute-policy ---

type RecomputePolicyRequest struct {
	ID string `param:"id"`
}

func (r *RecomputePolicyRequest) Validate() error {
	if r.ID == "" {
		return errs.NewBadRequestError("id is required", true, nil, nil, nil)
	}
	if _, err := uuid.Parse(r.ID); err != nil {
		return errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}
	return nil
}

func (h *ClaimHandler) RecomputePolicy(c echo.Context, req *RecomputePolicyRequest) (any, error) {
	id, _ := uuid.Parse(req.ID)
	return h.claimService.RecomputePolicyMatch(c.Request().Context(), id)
}

package handler

import (
	"net/http"
	"strings"
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
		UserRole:        middleware.GetUserRole(c),
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

	userRole := middleware.GetUserRole(c)
	orgID := middleware.GetOrgID(c)

	var (
		claims any
		err    error
	)
	if userRole == "org:admin" {
		if orgID == "" {
			return []model.Claim{}, nil
		}
		claims, err = h.claimService.GetAdminReviewClaims(
			c.Request().Context(),
			orgID,
			userID,
			model.DefaultAdminClaimFilters(),
		)
	} else {
		claims, err = h.claimService.GetUserClaims(c.Request().Context(), userID)
	}
	if err != nil {
		return nil, err
	}

	return claims, nil
}

type ListAdminClaimsRequest struct {
	Query          string `query:"q"`
	Statuses       string `query:"statuses"`
	UploaderUserID string `query:"uploaderUserId"`
	Flagged        string `query:"flagged"`
	DateField      string `query:"dateField"`
	DateFrom       string `query:"dateFrom"`
	DateTo         string `query:"dateTo"`
	SortBy         string `query:"sortBy"`
	SortDir        string `query:"sortDir"`
}

func (r *ListAdminClaimsRequest) Validate() error {
	validStatuses := map[string]bool{
		"pending":        true,
		"processing":     true,
		"ocr_complete":   true,
		"needs_review":   true,
		"ocr_failed":     true,
		"policy_matched": true,
		"auditing":       true,
		"approved":       true,
		"flagged":        true,
		"rejected":       true,
	}

	if r.Statuses != "" {
		for _, status := range strings.Split(r.Statuses, ",") {
			trimmedStatus := strings.TrimSpace(status)
			if trimmedStatus == "" {
				continue
			}
			if !validStatuses[trimmedStatus] {
				return errs.NewBadRequestError(
					"statuses contains an unsupported claim status",
					true, nil, nil, nil,
				)
			}
		}
	}

	if r.Flagged != "" &&
		r.Flagged != string(model.AdminClaimFlagFilterAll) &&
		r.Flagged != string(model.AdminClaimFlagFilterFlagged) &&
		r.Flagged != string(model.AdminClaimFlagFilterUnflagged) {
		return errs.NewBadRequestError(
			"flagged must be one of: all, flagged, unflagged",
			true, nil, nil, nil,
		)
	}

	if r.DateField != "" &&
		r.DateField != string(model.AdminClaimDateFieldSubmitted) &&
		r.DateField != string(model.AdminClaimDateFieldClaimed) {
		return errs.NewBadRequestError(
			"dateField must be one of: submitted, claimed",
			true, nil, nil, nil,
		)
	}

	if r.SortBy != "" {
		validSorts := map[string]bool{
			"submittedDate": true,
			"claimedDate":   true,
			"amount":        true,
			"status":        true,
			"merchant":      true,
		}
		if !validSorts[r.SortBy] {
			return errs.NewBadRequestError(
				"sortBy must be one of: submittedDate, claimedDate, amount, status, merchant",
				true, nil, nil, nil,
			)
		}
	}

	if r.SortDir != "" &&
		r.SortDir != string(model.ClaimSortDirectionAsc) &&
		r.SortDir != string(model.ClaimSortDirectionDesc) {
		return errs.NewBadRequestError(
			"sortDir must be one of: asc, desc",
			true, nil, nil, nil,
		)
	}

	if r.DateFrom != "" {
		if _, err := time.Parse("2006-01-02", r.DateFrom); err != nil {
			return errs.NewBadRequestError(
				"dateFrom must be in YYYY-MM-DD format",
				true, nil, nil, nil,
			)
		}
	}

	if r.DateTo != "" {
		if _, err := time.Parse("2006-01-02", r.DateTo); err != nil {
			return errs.NewBadRequestError(
				"dateTo must be in YYYY-MM-DD format",
				true, nil, nil, nil,
			)
		}
	}

	if r.DateFrom != "" && r.DateTo != "" && r.DateFrom > r.DateTo {
		return errs.NewBadRequestError(
			"dateFrom must be earlier than or equal to dateTo",
			true, nil, nil, nil,
		)
	}

	return nil
}

func (r *ListAdminClaimsRequest) ToFilters() (model.AdminClaimFilters, error) {
	filters := model.DefaultAdminClaimFilters()
	filters.Query = strings.TrimSpace(r.Query)
	filters.UploaderUserID = strings.TrimSpace(r.UploaderUserID)

	if r.Statuses != "" {
		statuses := make([]model.ClaimStatus, 0)
		for _, status := range strings.Split(r.Statuses, ",") {
			trimmedStatus := strings.TrimSpace(status)
			if trimmedStatus == "" {
				continue
			}
			statuses = append(statuses, model.ClaimStatus(trimmedStatus))
		}
		filters.Statuses = statuses
	}

	if r.Flagged != "" {
		filters.FlaggedFilter = model.AdminClaimFlagFilter(r.Flagged)
	}
	if r.DateField != "" {
		filters.DateField = model.AdminClaimDateField(r.DateField)
	}
	if r.SortBy != "" {
		filters.SortBy = model.AdminClaimSortBy(r.SortBy)
	}
	if r.SortDir != "" {
		filters.SortDirection = model.ClaimSortDirection(r.SortDir)
	}
	if r.DateFrom != "" {
		dateFrom, err := time.Parse("2006-01-02", r.DateFrom)
		if err != nil {
			return model.AdminClaimFilters{}, err
		}
		filters.DateFrom = &dateFrom
	}
	if r.DateTo != "" {
		dateTo, err := time.Parse("2006-01-02", r.DateTo)
		if err != nil {
			return model.AdminClaimFilters{}, err
		}
		filters.DateTo = &dateTo
	}

	return filters, nil
}

func (h *ClaimHandler) ListAdminClaims(c echo.Context, req *ListAdminClaimsRequest) (any, error) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return nil, errs.NewUnauthorizedError("unauthorized", false)
	}

	orgID := middleware.GetOrgID(c)
	if orgID == "" {
		return []model.Claim{}, nil
	}

	filters, err := req.ToFilters()
	if err != nil {
		return nil, errs.NewBadRequestError("invalid admin claim filters", true, nil, nil, nil)
	}

	return h.claimService.GetAdminReviewClaims(
		c.Request().Context(),
		orgID,
		userID,
		filters,
	)
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
	return h.claimService.GetClaim(
		c.Request().Context(),
		id,
		userID,
		middleware.GetOrgID(c),
		middleware.GetUserRole(c),
	)
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

	data, contentType, err := h.claimService.StreamReceipt(
		c.Request().Context(),
		id,
		userID,
		middleware.GetOrgID(c),
		middleware.GetUserRole(c),
	)
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

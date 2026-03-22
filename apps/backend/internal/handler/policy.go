package handler

import (
	"net/http"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/Akshay2642005/expense-auditor/internal/service"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

type PolicyHandler struct {
	Handler
	policyService *service.PolicyService
}

func NewPolicyHandler(s *server.Server, policyService *service.PolicyService) *PolicyHandler {
	return &PolicyHandler{
		Handler:       NewHandler(s),
		policyService: policyService,
	}
}

// UploadPolicy handles POST /api/v1/admin/policy
// Accepts multipart/form-data with fields: file (PDF), name, version.
func (h *PolicyHandler) UploadPolicy(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return errs.NewUnauthorizedError("unauthorized", false)
	}
	orgID := middleware.GetOrgID(c)
	if orgID == "" {
		return echo.NewHTTPError(http.StatusForbidden, "active organization required")
	}

	name := c.FormValue("name")
	if name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}
	version := c.FormValue("version") // optional

	file, header, err := c.Request().FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required")
	}
	defer file.Close()

	policy, err := h.policyService.UploadPolicy(c.Request().Context(), file, header, name, version, userID, orgID)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnprocessableEntity, err.Error())
	}

	return c.JSON(http.StatusAccepted, policy)
}

// GetPolicy handles GET /api/v1/admin/policy/:id
func (h *PolicyHandler) GetPolicy(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid policy id")
	}

	policy, err := h.policyService.GetPolicy(c.Request().Context(), id)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "policy not found")
	}

	return c.JSON(http.StatusOK, policy)
}

// ListPolicies handles GET /api/v1/admin/policy
func (h *PolicyHandler) ListPolicies(c echo.Context) error {
	orgID := middleware.GetOrgID(c)
	if orgID == "" {
		return c.JSON(http.StatusOK, []any{})
	}

	policies, err := h.policyService.ListPolicies(c.Request().Context(), orgID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list policies")
	}

	return c.JSON(http.StatusOK, policies)
}

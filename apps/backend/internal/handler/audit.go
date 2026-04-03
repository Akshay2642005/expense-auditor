package handler

import (
	"net/http"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/Akshay2642005/expense-auditor/internal/service"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
)

type AuditHandler struct {
	Handler
	service *service.AuditService
}

func NewAuditHandler(s *server.Server, service *service.AuditService) *AuditHandler {
	return &AuditHandler{
		Handler: NewHandler(s),
		service: service,
	}
}

func (h *AuditHandler) GetClaimAudit(c echo.Context, req *model.GetClaimAuditRequest) (any, error) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return nil, errs.NewUnauthorizedError("unauthorized", false)
	}
	claimID, err := uuid.Parse(req.ID)
	if err != nil {
		return nil, errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}
	return h.service.GetClaimAudit(
		c.Request().Context(),
		claimID,
		userID,
		middleware.GetOrgID(c),
		middleware.GetUserRole(c),
	)
}

func (h *AuditHandler) GetClaimAuditDirect(c echo.Context) error {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return errs.NewUnauthorizedError("unauthorized", false)
	}
	claimID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return errs.NewBadRequestError("id must be a valid UUID", true, nil, nil, nil)
	}
	result, err := h.service.GetClaimAudit(
		c.Request().Context(),
		claimID,
		userID,
		middleware.GetOrgID(c),
		middleware.GetUserRole(c),
	)
	if err != nil {
		return err
	}
	return c.JSON(http.StatusOK, result)
}

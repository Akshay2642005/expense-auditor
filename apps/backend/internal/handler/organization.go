package handler

import (
	"net/mail"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/Akshay2642005/expense-auditor/internal/service"
	"github.com/labstack/echo/v4"
)

type OrganizationHandler struct {
	Handler
	authService *service.AuthService
}

func NewOrganizationHandler(s *server.Server, authService *service.AuthService) *OrganizationHandler {
	return &OrganizationHandler{
		Handler:     NewHandler(s),
		authService: authService,
	}
}

type CreateOrganizationInvitationRequest struct {
	EmailAddress string `json:"emailAddress"`
	Role         string `json:"role"`
}

func (r *CreateOrganizationInvitationRequest) Validate() error {
	if r.EmailAddress == "" {
		return errs.NewBadRequestError("emailAddress is required", true, nil, nil, nil)
	}

	if _, err := mail.ParseAddress(r.EmailAddress); err != nil {
		return errs.NewBadRequestError("emailAddress must be a valid email address", true, nil, nil, nil)
	}

	if r.Role == "" {
		r.Role = "org:member"
	}

	switch r.Role {
	case "org:member", "org:admin":
		return nil
	default:
		return errs.NewBadRequestError("role must be either org:member or org:admin", true, nil, nil, nil)
	}
}

func (h *OrganizationHandler) CreateInvitation(c echo.Context, req *CreateOrganizationInvitationRequest) (any, error) {
	userID := middleware.GetUserID(c)
	if userID == "" {
		return nil, errs.NewUnauthorizedError("unauthorized", false)
	}

	orgID := middleware.GetOrgID(c)
	if orgID == "" {
		return nil, errs.NewForbiddenError("active organization required", false)
	}

	return h.authService.CreateOrganizationInvitation(
		c.Request().Context(),
		orgID,
		userID,
		c.Request().Header.Get("Origin"),
		req.EmailAddress,
		req.Role,
	)
}

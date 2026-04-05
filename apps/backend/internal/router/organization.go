package router

import (
	"net/http"

	"github.com/Akshay2642005/expense-auditor/internal/handler"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	clerkMiddleware "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/labstack/echo/v4"
)

func registerOrganizationRoutes(g *echo.Group, h *handler.Handlers) {
	admin := g.Group("/admin/organization",
		echo.WrapMiddleware(clerkMiddleware.RequireHeaderAuthorization()),
		middleware.RequireOrgAdmin,
	)

	admin.POST("/invitations", func(c echo.Context) error {
		return handler.Handle(
			h.Organization.Handler,
			h.Organization.CreateInvitation,
			http.StatusCreated,
			&handler.CreateOrganizationInvitationRequest{},
		)(c)
	})

	admin.PATCH("/members/:userId/role", func(c echo.Context) error {
		return handler.Handle(
			h.Organization.Handler,
			h.Organization.UpdateMembershipRole,
			http.StatusOK,
			&handler.UpdateOrganizationMembershipRoleRequest{},
		)(c)
	})
}

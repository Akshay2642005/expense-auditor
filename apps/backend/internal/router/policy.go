package router

import (
	"github.com/Akshay2642005/expense-auditor/internal/handler"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	clerkMiddleware "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/labstack/echo/v4"
)

// mountPolicyRoutes registers all /api/v1/admin/policy routes.
// Every route requires both authentication AND org:admin role.
func registerPolicyRoutes(g *echo.Group, h *handler.Handlers) {
	admin := g.Group("/admin/policy",
		echo.WrapMiddleware(clerkMiddleware.RequireHeaderAuthorization()),
		middleware.RequireOrgAdmin,
	)

	admin.POST("", h.Policy.UploadPolicy)
	admin.GET("", h.Policy.ListPolicies)
	admin.GET("/:id", h.Policy.GetPolicy)
}

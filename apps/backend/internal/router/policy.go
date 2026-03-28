package router

import (
	"github.com/Akshay2642005/expense-auditor/internal/handler"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	clerkMiddleware "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/labstack/echo/v4"
)

func registerPolicyRoutes(g *echo.Group, h *handler.Handlers) {
	// GET /api/v1/policy/active — all authenticated org members
	g.GET("/policy/active", h.Policy.GetActivePolicy)

	// Admin-only routes
	admin := g.Group("/admin/policy",
		echo.WrapMiddleware(clerkMiddleware.RequireHeaderAuthorization()),
		middleware.RequireOrgAdmin,
	)

	admin.POST("", h.Policy.UploadPolicy)
	admin.GET("", h.Policy.ListPolicies)
	admin.GET("/:id", h.Policy.GetPolicy)
}

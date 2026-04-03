package router

import (
	"net/http"

	"github.com/Akshay2642005/expense-auditor/internal/handler"
	"github.com/Akshay2642005/expense-auditor/internal/middleware"
	clerkMiddleware "github.com/clerk/clerk-sdk-go/v2/http"
	"github.com/labstack/echo/v4"
)

func registerClaimRoutes(g *echo.Group, h *handler.Handlers) {
	claims := g.Group("/claims")
	admin := g.Group("/admin/claims",
		echo.WrapMiddleware(clerkMiddleware.RequireHeaderAuthorization()),
		middleware.RequireOrgAdmin,
	)

	// POST /api/v1/claims — multipart upload (handled manually, not via Handle[])
	claims.POST("", h.Claim.SubmitClaim)

	// GET /api/v1/claims
	claims.GET("", func(c echo.Context) error {
		return handler.Handle(
			h.Claim.Handler,
			h.Claim.ListClaims,
			http.StatusOK,
			&handler.ListClaimsRequest{},
		)(c)
	})

	// GET /api/v1/admin/claims
	admin.GET("", func(c echo.Context) error {
		return handler.Handle(
			h.Claim.Handler,
			h.Claim.ListAdminClaims,
			http.StatusOK,
			&handler.ListAdminClaimsRequest{},
		)(c)
	})

	// GET /api/v1/claims/:id/receipt — streams the file bytes from GCS
	claims.GET("/:id/receipt", h.Claim.GetReceipt)

	// GET /api/v1/claims/:id/audit — returns the latest AI audit result for the claim
	claims.GET("/:id/audit", h.AuditHandler.GetClaimAuditDirect)

	// GET /api/v1/claims/:id — must be registered AFTER sub-paths to avoid shadowing
	claims.GET("/:id", func(c echo.Context) error {
		return handler.Handle(
			h.Claim.Handler,
			h.Claim.GetClaim,
			http.StatusOK,
			&handler.GetClaimRequest{},
		)(c)
	})

	// POST /api/v1/admin/claims/:id/recompute-policy
	admin.POST("/:id/recompute-policy", func(c echo.Context) error {
		return handler.Handle(
			h.Claim.Handler,
			h.Claim.RecomputePolicy,
			http.StatusOK,
			&handler.RecomputePolicyRequest{},
		)(c)
	})
}

package router

import (
	"net/http"

	"github.com/Akshay2642005/expense-auditor/internal/handler"
	"github.com/labstack/echo/v4"
)

func registerClaimRoutes(g *echo.Group, h *handler.Handlers) {
	claims := g.Group("/claims")

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

	// GET /api/v1/claims/:id
	claims.GET("/:id", func(c echo.Context) error {
		return handler.Handle(
			h.Claim.Handler,
			h.Claim.GetClaim,
			http.StatusOK,
			&handler.GetClaimRequest{},
		)(c)
	})

	// GET /api/v1/claims/:id/receipt — streams the file bytes from GCS
	claims.GET("/:id/receipt", h.Claim.GetReceipt)
}

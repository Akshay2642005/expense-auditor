package middleware

import (
	"net/http"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/labstack/echo/v4"
)

// RequireOrgAdmin checks that the authenticated user's active Clerk organization
// role is "org:admin". Must be used AFTER RequireAuth (clerk.RequireHeaderAuthorization).
func RequireOrgAdmin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		claims, ok := clerk.SessionClaimsFromContext(c.Request().Context())
		if !ok || claims == nil {
			return echo.NewHTTPError(http.StatusUnauthorized, "unauthorized")
		}
		// clerk-sdk-go/v2 exposes org role as ActiveOrganizationRole on SessionClaims.
		if claims.ActiveOrganizationRole != "org:admin" {
			return echo.NewHTTPError(http.StatusForbidden, "admin access required")
		}
		return next(c)
	}
}

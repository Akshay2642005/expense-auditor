package service

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/organizationinvitation"
)

type AuthService struct {
	server *server.Server
}

type CreateOrganizationInvitationOutput struct {
	ID           string `json:"id"`
	EmailAddress string `json:"emailAddress"`
	Role         string `json:"role"`
	Status       string `json:"status"`
	RedirectURL  string `json:"redirectUrl"`
}

func NewAuthService(s *server.Server) *AuthService {
	clerk.SetKey(s.Config.Auth.SecretKey)
	return &AuthService{
		server: s,
	}
}

func (s *AuthService) CreateOrganizationInvitation(
	ctx context.Context,
	orgID string,
	inviterUserID string,
	origin string,
	emailAddress string,
	role string,
) (*CreateOrganizationInvitationOutput, error) {
	redirectURL, err := s.resolveInvitationRedirectURL(origin)
	if err != nil {
		return nil, err
	}

	if role == "" {
		role = "org:member"
	}

	params := &organizationinvitation.CreateParams{
		OrganizationID: orgID,
		EmailAddress:   &emailAddress,
		Role:           &role,
		RedirectURL:    &redirectURL,
		InviterUserID:  &inviterUserID,
	}

	invitation, err := organizationinvitation.Create(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("create organization invitation: %w", err)
	}

	return &CreateOrganizationInvitationOutput{
		ID:           invitation.ID,
		EmailAddress: invitation.EmailAddress,
		Role:         invitation.Role,
		Status:       invitation.Status,
		RedirectURL:  redirectURL,
	}, nil
}

func (s *AuthService) resolveInvitationRedirectURL(origin string) (string, error) {
	if cleanOrigin, ok := s.resolveAppOrigin(origin); ok {
		return cleanOrigin + "/accept-invitation", nil
	}

	return "", errs.NewBadRequestError("could not determine invitation redirect URL", false, nil, nil, nil)
}

func (s *AuthService) resolveAppOrigin(origin string) (string, bool) {
	cleanOrigin := sanitizeOrigin(origin)
	if cleanOrigin != "" && s.isAllowedOrigin(cleanOrigin) {
		return cleanOrigin, true
	}

	for _, allowed := range s.server.Config.Server.CORSAllowedOrigins {
		cleanAllowed := sanitizeOrigin(allowed)
		if cleanAllowed != "" {
			return cleanAllowed, true
		}
	}

	return "", false
}

func (s *AuthService) isAllowedOrigin(origin string) bool {
	for _, allowed := range s.server.Config.Server.CORSAllowedOrigins {
		cleanAllowed := sanitizeOrigin(allowed)
		if cleanAllowed != "" && cleanAllowed == origin {
			return true
		}
	}

	return false
}

func sanitizeOrigin(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || value == "*" {
		return ""
	}

	parsed, err := url.Parse(value)
	if err != nil {
		return ""
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return ""
	}

	if parsed.Host == "" {
		return ""
	}

	return strings.TrimRight(parsed.Scheme+"://"+parsed.Host, "/")
}

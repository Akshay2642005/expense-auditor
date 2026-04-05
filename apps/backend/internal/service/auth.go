package service

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/errs"
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/organizationinvitation"
	"github.com/clerk/clerk-sdk-go/v2/organizationmembership"
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

type UpdateOrganizationMembershipRoleOutput struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
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

	emailAddress = normalizeInvitationEmail(emailAddress)

	existingInvitation, err := s.findPendingOrganizationInvitationByEmail(
		ctx,
		orgID,
		emailAddress,
	)
	if err != nil {
		return nil, err
	}

	if existingInvitation != nil {
		if existingInvitation.Role == role {
			return buildCreateOrganizationInvitationOutput(existingInvitation, redirectURL), nil
		}

		return nil, errs.NewBadRequestError(
			fmt.Sprintf(
				"%s already has a pending %s invitation. Wait for it to be accepted or expire before sending a different role.",
				emailAddress,
				readableOrganizationRole(existingInvitation.Role),
			),
			true,
			nil,
			nil,
			nil,
		)
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
		if apiErr, ok := err.(*clerk.APIErrorResponse); ok && apiErr.HTTPStatusCode == http.StatusTooManyRequests {
			return nil, errs.NewBadRequestError(
				buildInvitationRateLimitMessage(apiErr),
				true,
				nil,
				nil,
				nil,
			)
		}

		return nil, fmt.Errorf("create organization invitation: %w", err)
	}

	return buildCreateOrganizationInvitationOutput(invitation, redirectURL), nil
}

func (s *AuthService) UpdateOrganizationMembershipRole(
	ctx context.Context,
	orgID string,
	targetUserID string,
	role string,
) (*UpdateOrganizationMembershipRoleOutput, error) {
	switch role {
	case "org:member", "org:admin":
	default:
		return nil, errs.NewBadRequestError("role must be either org:member or org:admin", true, nil, nil, nil)
	}

	params := &organizationmembership.UpdateParams{
		OrganizationID: orgID,
		UserID:         targetUserID,
		Role:           &role,
	}

	membership, err := organizationmembership.Update(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("update organization membership role: %w", err)
	}

	userID := targetUserID
	if membership.PublicUserData != nil && membership.PublicUserData.UserID != "" {
		userID = membership.PublicUserData.UserID
	}

	return &UpdateOrganizationMembershipRoleOutput{
		UserID: userID,
		Role:   membership.Role,
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

func normalizeInvitationEmail(emailAddress string) string {
	return strings.ToLower(strings.TrimSpace(emailAddress))
}

func readableOrganizationRole(role string) string {
	if role == "org:admin" {
		return "admin"
	}

	return "member"
}

func buildCreateOrganizationInvitationOutput(
	invitation *clerk.OrganizationInvitation,
	redirectURL string,
) *CreateOrganizationInvitationOutput {
	return &CreateOrganizationInvitationOutput{
		ID:           invitation.ID,
		EmailAddress: invitation.EmailAddress,
		Role:         invitation.Role,
		Status:       invitation.Status,
		RedirectURL:  redirectURL,
	}
}

func buildInvitationRateLimitMessage(apiErr *clerk.APIErrorResponse) string {
	message := "Too many invitation requests were sent to Clerk. Please try again in a bit."
	if apiErr == nil || apiErr.Response == nil {
		return message
	}

	if retryAfter := strings.TrimSpace(apiErr.Response.Header.Get("Retry-After")); retryAfter != "" {
		return fmt.Sprintf(
			"Too many invitation requests were sent to Clerk. Please wait about %s seconds before trying again.",
			retryAfter,
		)
	}

	return message
}

func (s *AuthService) findPendingOrganizationInvitationByEmail(
	ctx context.Context,
	orgID string,
	emailAddress string,
) (*clerk.OrganizationInvitation, error) {
	statuses := []string{"pending"}
	limit := int64(100)

	list, err := organizationinvitation.List(ctx, &organizationinvitation.ListParams{
		OrganizationID: orgID,
		Statuses:       &statuses,
		ListParams: clerk.ListParams{
			Limit: &limit,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("list organization invitations: %w", err)
	}

	for _, invitation := range list.OrganizationInvitations {
		if invitation == nil {
			continue
		}

		if normalizeInvitationEmail(invitation.EmailAddress) == emailAddress {
			return invitation, nil
		}
	}

	return nil, nil
}

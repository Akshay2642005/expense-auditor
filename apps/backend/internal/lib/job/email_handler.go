package job

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/Akshay2642005/expense-auditor/internal/model"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/user"
	"github.com/hibiken/asynq"
)

func (j *JobService) handleWelcomeEmailTask(_ context.Context, t *asynq.Task) error {
	if emailClient == nil {
		return fmt.Errorf("email client not configured")
	}

	var payload WelcomeEmailPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("email: unmarshal welcome payload: %w", err)
	}

	return emailClient.SendWelcomeEmail(payload.To, payload.FirstName)
}

func (j *JobService) handleClaimOutcomeEmailTask(ctx context.Context, t *asynq.Task) error {
	if emailClient == nil {
		return fmt.Errorf("email client not configured")
	}

	var payload ClaimOutcomeEmailPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("email: unmarshal claim outcome payload: %w", err)
	}

	claim, err := j.claimService.GetClaimForJob(ctx, payload.ClaimID)
	if err != nil {
		return fmt.Errorf("email: load claim: %w", err)
	}

	if claim.Status != payload.Status {
		j.logger.Debug().
			Str("claim_id", payload.ClaimID.String()).
			Str("queued_status", string(payload.Status)).
			Str("current_status", string(claim.Status)).
			Msg("skipping stale claim outcome notification")
		return nil
	}

	profile, err := user.Get(ctx, claim.UserID)
	if err != nil {
		if isLocalJobEnvironment(j.cfg.Primary.Env) {
			j.logger.Warn().
				Err(err).
				Str("claim_id", payload.ClaimID.String()).
				Str("user_id", claim.UserID).
				Msg("skipping claim outcome email lookup failure in local environment")
			return nil
		}
		return fmt.Errorf("email: resolve clerk user: %w", err)
	}

	recipientEmail := clerkPrimaryEmail(profile)
	if recipientEmail == "" {
		j.logger.Warn().
			Str("claim_id", payload.ClaimID.String()).
			Str("user_id", claim.UserID).
			Msg("skipping claim outcome email because no recipient email was found")
		return nil
	}

	recipientName := clerkDisplayName(profile)
	claimURL := claimOutcomeURL(j.cfg.Server.CORSAllowedOrigins, payload.ClaimID.String(), j.cfg.Primary.Env)
	claimLabel := claimOutcomeClaimLabel(claim)
	amountText := claimOutcomeAmountText(claim)
	title, summary, ctaLabel := claimOutcomeCopy(payload.Status)

	if err := emailClient.SendClaimOutcomeEmail(recipientEmail, recipientName, map[string]string{
		"RecipientName":  recipientName,
		"OutcomeTitle":   title,
		"OutcomeLabel":   claimOutcomeLabel(payload.Status),
		"OutcomeSummary": summary,
		"ClaimLabel":     claimLabel,
		"ClaimID":        payload.ClaimID.String(),
		"ClaimAmount":    amountText,
		"Reason":         strings.TrimSpace(payload.Reason),
		"ClaimURL":       claimURL,
		"CTA":            ctaLabel,
	}); err != nil {
		if isLocalJobEnvironment(j.cfg.Primary.Env) {
			j.logger.Warn().
				Err(err).
				Str("claim_id", payload.ClaimID.String()).
				Str("to", recipientEmail).
				Msg("skipping claim outcome email send failure in local environment")
			return nil
		}
		return fmt.Errorf("email: send claim outcome email: %w", err)
	}

	j.logger.Info().
		Str("claim_id", payload.ClaimID.String()).
		Str("status", string(payload.Status)).
		Str("to", recipientEmail).
		Msg("claim outcome email sent")

	return nil
}

func clerkDisplayName(profile *clerk.User) string {
	if profile == nil {
		return "there"
	}

	parts := make([]string, 0, 2)
	if profile.FirstName != nil && strings.TrimSpace(*profile.FirstName) != "" {
		parts = append(parts, strings.TrimSpace(*profile.FirstName))
	}
	if profile.LastName != nil && strings.TrimSpace(*profile.LastName) != "" {
		parts = append(parts, strings.TrimSpace(*profile.LastName))
	}

	if len(parts) > 0 {
		return strings.Join(parts, " ")
	}

	if email := clerkPrimaryEmail(profile); email != "" {
		return email
	}

	return "there"
}

func clerkPrimaryEmail(profile *clerk.User) string {
	if profile == nil {
		return ""
	}

	if profile.PrimaryEmailAddressID != nil {
		for _, email := range profile.EmailAddresses {
			if email != nil && email.ID == *profile.PrimaryEmailAddressID {
				return strings.TrimSpace(email.EmailAddress)
			}
		}
	}

	for _, email := range profile.EmailAddresses {
		if email != nil && strings.TrimSpace(email.EmailAddress) != "" {
			return strings.TrimSpace(email.EmailAddress)
		}
	}

	return ""
}

func claimOutcomeCopy(status model.ClaimStatus) (title string, summary string, ctaLabel string) {
	switch status {
	case model.ClaimStatusApproved:
		return "Your expense claim was approved", "Your claim passed review and is ready for the next reimbursement step.", "View approved claim"
	case model.ClaimStatusRejected:
		return "Your expense claim was rejected", "Your claim needs changes before it can move forward.", "Review rejected claim"
	default:
		return "Your expense claim needs clarification", "Your claim needs a quick follow-up before review can finish.", "Open claim details"
	}
}

func claimOutcomeLabel(status model.ClaimStatus) string {
	switch status {
	case model.ClaimStatusApproved:
		return "Approved"
	case model.ClaimStatusRejected:
		return "Rejected"
	default:
		return "Needs clarification"
	}
}

func claimOutcomeAmountText(claim *model.Claim) string {
	if claim == nil || claim.Amount == nil {
		return "Pending OCR amount"
	}

	if claim.Currency != nil && strings.TrimSpace(*claim.Currency) != "" {
		return fmt.Sprintf("%s %.2f", strings.TrimSpace(*claim.Currency), *claim.Amount)
	}

	return fmt.Sprintf("%.2f", *claim.Amount)
}

func claimOutcomeClaimLabel(claim *model.Claim) string {
	if claim == nil {
		return "Expense claim"
	}

	if claim.MerchantName != nil && strings.TrimSpace(*claim.MerchantName) != "" {
		return strings.TrimSpace(*claim.MerchantName)
	}

	if trimmed := strings.TrimSpace(claim.BusinessPurpose); trimmed != "" {
		if len(trimmed) > 72 {
			return trimmed[:69] + "..."
		}
		return trimmed
	}

	return "Expense claim"
}

func claimOutcomeURL(origins []string, claimID string, env string) string {
	for _, origin := range origins {
		if clean := sanitizeAllowedOrigin(origin); clean != "" {
			return clean + "/claims/" + claimID
		}
	}

	if strings.EqualFold(strings.TrimSpace(env), "local") {
		return "http://localhost:5173/claims/" + claimID
	}

	return ""
}

func sanitizeAllowedOrigin(value string) string {
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

func isLocalJobEnvironment(env string) bool {
	return strings.EqualFold(strings.TrimSpace(env), "local")
}

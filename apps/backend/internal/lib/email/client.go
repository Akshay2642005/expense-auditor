package email

import (
	"bytes"
	"fmt"
	"html/template"
	"os"
	"path/filepath"

	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/pkg/errors"
	"github.com/resend/resend-go/v2"
	"github.com/rs/zerolog"
)

type Client struct {
	client *resend.Client
	logger *zerolog.Logger
	from   string
}

func NewClient(cfg *config.Config, logger *zerolog.Logger) *Client {
	return &Client{
		client: resend.NewClient(cfg.Integration.ResendAPIKey),
		logger: logger,
		from:   cfg.Integration.ResendFrom,
	}
}

func (c *Client) SendEmail(to, subject string, templateName Template, data map[string]string) error {
	tmplPath, err := resolveTemplatePath(templateName)
	if err != nil {
		return err
	}

	tmpl, err := template.ParseFiles(tmplPath)
	if err != nil {
		return errors.Wrapf(err, "failed to parse email template %s", templateName)
	}

	var body bytes.Buffer
	if err := tmpl.Execute(&body, data); err != nil {
		return errors.Wrapf(err, "failed to execute email template %s", templateName)
	}

	params := &resend.SendEmailRequest{
		From:    fmt.Sprintf("Expense Auditor <%s>", c.from),
		To:      []string{to},
		Subject: subject,
		Html:    body.String(),
	}

	_, err = c.client.Emails.Send(params)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

func resolveTemplatePath(templateName Template) (string, error) {
	filename := fmt.Sprintf("%s.html", templateName)
	candidates := []string{
		filepath.Join("templates", "emails", filename),
		filepath.Join("apps", "backend", "templates", "emails", filename),
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			return candidate, nil
		}
	}

	return "", errors.Errorf("failed to find email template %s in known template directories", templateName)
}

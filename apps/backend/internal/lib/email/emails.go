package email

func (c *Client) SendWelcomeEmail(to, firstName string) error {
	data := map[string]string{
		"UserFirstName": firstName,
	}

	return c.SendEmail(
		to,
		"Welcome to expense-auditor!",
		TemplateWelcome,
		data,
	)
}

func (c *Client) SendClaimOutcomeEmail(to, recipientName string, data map[string]string) error {
	if data == nil {
		data = map[string]string{}
	}

	if data["RecipientName"] == "" {
		data["RecipientName"] = recipientName
	}

	subject := data["OutcomeTitle"]
	if subject == "" {
		subject = "Your expense claim has an update"
	}

	return c.SendEmail(
		to,
		subject,
		TemplateClaimOutcome,
		data,
	)
}

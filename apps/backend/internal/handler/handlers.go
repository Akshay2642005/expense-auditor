package handler

import (
	"github.com/Akshay2642005/expense-auditor/internal/server"
	"github.com/Akshay2642005/expense-auditor/internal/service"
)

type Handlers struct {
	Health       *HealthHandler
	OpenAPI      *OpenAPIHandler
	Claim        *ClaimHandler
	Policy       *PolicyHandler
	Organization *OrganizationHandler
	AuditHandler *AuditHandler
}

func NewHandlers(s *server.Server, services *service.Services) *Handlers {
	return &Handlers{
		Health:       NewHealthHandler(s),
		OpenAPI:      NewOpenAPIHandler(s),
		Claim:        NewClaimHandler(s, services.Claim, services.Audit),
		Policy:       NewPolicyHandler(s, services.Policy),
		Organization: NewOrganizationHandler(s, services.Auth),
		AuditHandler: NewAuditHandler(s, services.Audit),
	}
}

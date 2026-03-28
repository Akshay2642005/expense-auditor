package service

import (
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
)

type Services struct {
	Auth   *AuthService
	Claim  *ClaimService
	Policy *PolicyService
	Job    *job.JobService
	Audit  *AuditService
}

func NewServices(s *server.Server, repos *repository.Repositories) (*Services, error) {
	authService := NewAuthService(s)
	claimService := NewClaimService(s, repos)
	policyService := NewPolicyService(s, repos)
	auditService := NewAuditService(s, repos)
	s.Job.SetServices(claimService, policyService, auditService)
	return &Services{
		Job:    s.Job,
		Auth:   authService,
		Claim:  claimService,
		Policy: policyService,
		Audit:  auditService,
	}, nil
}

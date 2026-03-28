package repository

import "github.com/Akshay2642005/expense-auditor/internal/server"

type Repositories struct {
	Claim  *ClaimRepository
	Policy *PolicyRepository
	Audit  *AuditRepository
}

func NewRepositories(s *server.Server) *Repositories {
	return &Repositories{
		Claim:  NewClaimRepository(s.DB.Pool),
		Policy: NewPolicyRepository(s.DB.Pool),
		Audit:  NewAuditRepository(s.DB.Pool),
	}
}

package service

import (
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
)

type Services struct {
	Auth  *AuthService
	Claim *ClaimService
	Job   *job.JobService
}

func NewServices(s *server.Server, repos *repository.Repositories) (*Services, error) {
	authService := NewAuthService(s)
	claimService := NewClaimService(s, repos)
	return &Services{
		Job:   s.Job,
		Auth:  authService,
		Claim: claimService,
	}, nil
}

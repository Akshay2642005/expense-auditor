package service

import (
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	"github.com/Akshay2642005/expense-auditor/internal/repository"
	"github.com/Akshay2642005/expense-auditor/internal/server"
)

type Services struct {
	Auth *AuthService
	Job  *job.JobService
}

func NewServices(s *server.Server, repos *repository.Repositories) (*Services, error) {
	authService := NewAuthService(s)

	return &Services{
		Job:  s.Job,
		Auth: authService,
	}, nil
}



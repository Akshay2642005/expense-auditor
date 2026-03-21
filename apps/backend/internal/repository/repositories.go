package repository

import "github.com/Akshay2642005/expense-auditor/internal/server"

type Repositories struct{}

func NewRepositories(s *server.Server) *Repositories {
	return &Repositories{}
}



package middleware

import (
	"github.com/Akshay2642005/expense-auditor/internal/server"
)

type RateLimitMiddleware struct {
	server *server.Server
}

func NewRateLimitMiddleware(s *server.Server) *RateLimitMiddleware {
	return &RateLimitMiddleware{
		server: s,
	}
}

func (r *RateLimitMiddleware) RecordRateLimitHit(endpoint string) {
	if r.server.LoggerService != nil && r.server.LoggerService.GetApplication() != nil {
		r.server.LoggerService.GetApplication().RecordCustomEvent("RateLimitHit", map[string]interface{}{
			"endpoint": endpoint,
		})
	}
}



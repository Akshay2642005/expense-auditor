package job

import (
	"errors"

	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/hibiken/asynq"
	"github.com/rs/zerolog"
)

// JobService manages asynq client and server lifecycle.
type JobService struct {
	Client *asynq.Client
	server *asynq.Server
	logger *zerolog.Logger
	cfg    *config.Config

	claimService  ClaimJobService
	policyService PolicyJobService
	auditService  AuditJobService
}

func NewJobService(logger *zerolog.Logger, cfg *config.Config) *JobService {
	redisAddr := cfg.Redis.Address

	redisConn, err := asynq.ParseRedisURI(redisAddr)
	if err != nil {
		var fallbackErr error
		redisConn, fallbackErr = asynq.ParseRedisURI("redis://" + redisAddr)
		if fallbackErr != nil {
			logger.Fatal().
				Err(err).
				Str("addr", redisAddr).
				Msg("failed to parse redis connection string")
		}
	}

	client := asynq.NewClient(redisConn)

	server := asynq.NewServer(
		redisConn,
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				"critical": 6,
				"email":    2,
				"default":  3,
				"low":      1,
			},
		},
	)

	return &JobService{
		Client: client,
		server: server,
		logger: logger,
		cfg:    cfg,
	}
}

func (j *JobService) Start() error {
	if j.claimService == nil || j.policyService == nil || j.auditService == nil {
		return errors.New("job services not configured")
	}

	mux := asynq.NewServeMux()
	j.registerHandlers(mux)

	j.logger.Info().Msg("starting background job server")
	return j.server.Start(mux)
}

func (j *JobService) Stop() {
	j.logger.Info().Msg("stopping background job server")
	j.server.Shutdown()
	j.Client.Close()
}

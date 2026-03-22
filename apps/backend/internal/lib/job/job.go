package job

import (
	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/hibiken/asynq"
	"github.com/rs/zerolog"
)

// JobService manages asynq client and server lifecycle.
type JobService struct {
	Client *asynq.Client
	server *asynq.Server
	logger *zerolog.Logger
}

func NewJobService(logger *zerolog.Logger, cfg *config.Config) *JobService {
	redisAddr := cfg.Redis.Address

	client := asynq.NewClient(asynq.RedisClientOpt{Addr: redisAddr})

	server := asynq.NewServer(
		asynq.RedisClientOpt{Addr: redisAddr},
		asynq.Config{
			Concurrency: 10,
			Queues: map[string]int{
				"critical": 6,
				"default":  3,
				"low":      1,
			},
		},
	)

	return &JobService{
		Client: client,
		server: server,
		logger: logger,
	}
}

func (j *JobService) Start() error {
	mux := asynq.NewServeMux()
	mux.HandleFunc(TaskOCRReceipt, j.handleOCRReceiptTask)
	mux.HandleFunc(TaskPolicyIngestion, j.handlePolicyIngestionTask)

	j.logger.Info().Msg("starting background job server")
	return j.server.Start(mux)
}

func (j *JobService) Stop() {
	j.logger.Info().Msg("stopping background job server")
	j.server.Shutdown()
	j.Client.Close()
}

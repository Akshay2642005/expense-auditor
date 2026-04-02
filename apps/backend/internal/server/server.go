package server

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/cache"
	"github.com/Akshay2642005/expense-auditor/internal/config"
	"github.com/Akshay2642005/expense-auditor/internal/database"
	"github.com/Akshay2642005/expense-auditor/internal/lib/gemini"
	"github.com/Akshay2642005/expense-auditor/internal/lib/job"
	gcslib "github.com/Akshay2642005/expense-auditor/internal/lib/storage"
	loggerPkg "github.com/Akshay2642005/expense-auditor/internal/logger"
	"github.com/newrelic/go-agent/v3/integrations/nrredis-v9"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"
)

type Server struct {
	Config        *config.Config
	Logger        *zerolog.Logger
	LoggerService *loggerPkg.LoggerService
	DB            *database.Database
	Redis         *redis.Client
	Cache         *cache.Client
	GCS           *gcslib.GCSClient
	Gemini        *gemini.Client
	httpServer    *http.Server
	Job           *job.JobService
}

func New(cfg *config.Config, logger *zerolog.Logger, loggerService *loggerPkg.LoggerService) (*Server, error) {
	db, err := database.New(cfg, logger, loggerService)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	redisOpts := &redis.Options{
		Addr: cfg.Redis.Address,
	}
	redisClient := redis.NewClient(redisOpts)

	if loggerService != nil && loggerService.GetApplication() != nil {
		redisClient.AddHook(nrredis.NewHook(redisClient.Options()))
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Error().Err(err).Msg("Failed to connect to Redis, continuing without Redis")
	}

	gcsClient, err := gcslib.NewGCSClient(
		context.Background(),
		cfg.Storage.GCSBucketName,
		cfg.Storage.GCSCredentials,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to initialise GCS client: %w", err)
	}
	logger.Info().Str("bucket", cfg.Storage.GCSBucketName).Msg("connected to GCS")

	geminiClient, err := gemini.NewClient(context.Background(), cfg.AI.GeminiAPIKey)
	if err != nil {
		return nil, fmt.Errorf("failed to initialise Gemini client: %w", err)
	}
	logger.Info().Msg("gemini client initialised")

	jobService := job.NewJobService(logger, cfg)
	jobService.InitHandlers(cfg, logger)
	jobService.InitOCRHandlers(geminiClient, gcsClient, cfg.AI.DateMismatchThreshold)
	jobService.InitPolicyHandlers(geminiClient, gcsClient)
	jobService.InitAuditHandlers(geminiClient)

	// Run migrations

	if err = database.Migrate(ctx, logger, cfg); err != nil {
		logger.Error().Err(err).Msg("Failed to run database migrations")
	} else {
		logger.Info().Msg("Database migrations ran successfully")
	}

	server := &Server{
		Config:        cfg,
		Logger:        logger,
		LoggerService: loggerService,
		DB:            db,
		Redis:         redisClient,
		Cache:         cache.New(redisClient),
		GCS:           gcsClient,
		Gemini:        geminiClient,
		Job:           jobService,
	}

	return server, nil
}

func (s *Server) SetupHTTPServer(handler http.Handler) {
	s.httpServer = &http.Server{
		Addr:         ":" + s.Config.Server.Port,
		Handler:      handler,
		ReadTimeout:  time.Duration(s.Config.Server.ReadTimeout) * time.Second,
		WriteTimeout: time.Duration(s.Config.Server.WriteTimeout) * time.Second,
		IdleTimeout:  time.Duration(s.Config.Server.IdleTimeout) * time.Second,
	}
}

func (s *Server) Start() error {
	if s.httpServer == nil {
		return errors.New("HTTP server not initialized")
	}

	s.Logger.Info().
		Str("port", s.Config.Server.Port).
		Str("env", s.Config.Primary.Env).
		Msg("starting server")

	return s.httpServer.ListenAndServe()
}

func (s *Server) Shutdown(ctx context.Context) error {
	if err := s.httpServer.Shutdown(ctx); err != nil {
		return fmt.Errorf("failed to shutdown HTTP server: %w", err)
	}

	if err := s.DB.Close(); err != nil {
		return fmt.Errorf("failed to close database connection: %w", err)
	}

	if s.Job != nil {
		s.Job.Stop()
	}

	return nil
}

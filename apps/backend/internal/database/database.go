package database

import (
	"context"
	"fmt"
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/Akshay2642005/expense-auditor/internal/config"
	loggerConfig "github.com/Akshay2642005/expense-auditor/internal/logger"
	pgxzero "github.com/jackc/pgx-zerolog"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/tracelog"
	"github.com/newrelic/go-agent/v3/integrations/nrpgx5"
	pgxvec "github.com/pgvector/pgvector-go/pgx"
	"github.com/rs/zerolog"
)

type Database struct {
	Pool *pgxpool.Pool
	log  *zerolog.Logger
}

// contextKey is used to store the SQL of a query in context so filteredTraceLog
// can access it in TraceQueryEnd (which doesn't carry the SQL itself).
type contextKey struct{}

// multiTracer chains multiple pgx tracers.
type multiTracer struct {
	tracers []any
}

func (mt *multiTracer) TraceQueryStart(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	for _, tracer := range mt.tracers {
		if t, ok := tracer.(interface {
			TraceQueryStart(context.Context, *pgx.Conn, pgx.TraceQueryStartData) context.Context
		}); ok {
			ctx = t.TraceQueryStart(ctx, conn, data)
		}
	}
	return ctx
}

func (mt *multiTracer) TraceQueryEnd(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryEndData) {
	for _, tracer := range mt.tracers {
		if t, ok := tracer.(interface {
			TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData)
		}); ok {
			t.TraceQueryEnd(ctx, conn, data)
		}
	}
}

// filteredTraceLog wraps tracelog.TraceLog and suppresses noisy driver-internal
// queries (pgvector type registration) from local development logs.
type filteredTraceLog struct {
	inner *tracelog.TraceLog
}

func (f *filteredTraceLog) TraceQueryStart(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if isInternalQuery(data.SQL) {
		// Store a sentinel so TraceQueryEnd knows to skip this query too.
		return context.WithValue(ctx, contextKey{}, true)
	}
	return f.inner.TraceQueryStart(ctx, conn, data)
}

func (f *filteredTraceLog) TraceQueryEnd(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryEndData) {
	if skip, _ := ctx.Value(contextKey{}).(bool); skip {
		return
	}
	f.inner.TraceQueryEnd(ctx, conn, data)
}

// isInternalQuery returns true for driver-internal queries that are noise in dev logs.
func isInternalQuery(sql string) bool {
	return strings.Contains(sql, "to_regtype") ||
		(strings.Contains(sql, "pg_type") && strings.Contains(sql, "typname"))
}

const DatabasePingTimeout = 10

func New(cfg *config.Config, logger *zerolog.Logger, loggerService *loggerConfig.LoggerService) (*Database, error) {
	hostPort := net.JoinHostPort(cfg.Database.Host, strconv.Itoa(cfg.Database.Port))

	// URL-encode the password
	encodedPassword := url.QueryEscape(cfg.Database.Password)
	dsn := fmt.Sprintf("postgres://%s:%s@%s/%s?sslmode=%s",
		cfg.Database.User,
		encodedPassword,
		hostPort,
		cfg.Database.Name,
		cfg.Database.SSLMode,
	)

	pgxPoolConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse pgx pool config: %w", err)
	}

	// Register pgvector types for pgx (needed for COPY and binary encoding).
	prevAfterConnect := pgxPoolConfig.AfterConnect
	pgxPoolConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		if prevAfterConnect != nil {
			if err := prevAfterConnect(ctx, conn); err != nil {
				return err
			}
		}
		return pgxvec.RegisterTypes(ctx, conn)
	}

	// Add New Relic PostgreSQL instrumentation
	if loggerService != nil && loggerService.GetApplication() != nil {
		pgxPoolConfig.ConnConfig.Tracer = nrpgx5.NewTracer()
	}

	if cfg.Primary.Env == "local" {
		globalLevel := logger.GetLevel()
		pgxLogger := loggerConfig.NewPgxLogger(globalLevel)
		localTracer := &filteredTraceLog{
			inner: &tracelog.TraceLog{
				Logger:   pgxzero.NewLogger(pgxLogger),
				LogLevel: tracelog.LogLevel(loggerConfig.GetPgxTraceLogLevel(globalLevel)),
			},
		}
		if pgxPoolConfig.ConnConfig.Tracer != nil {
			pgxPoolConfig.ConnConfig.Tracer = &multiTracer{
				tracers: []any{pgxPoolConfig.ConnConfig.Tracer, localTracer},
			}
		} else {
			pgxPoolConfig.ConnConfig.Tracer = localTracer
		}
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), pgxPoolConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to create pgx pool: %w", err)
	}

	database := &Database{
		Pool: pool,
		log:  logger,
	}

	ctx, cancel := context.WithTimeout(context.Background(), DatabasePingTimeout*time.Second)
	defer cancel()
	if err = pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info().Msg("connected to the database")

	return database, nil
}

func (db *Database) Close() error {
	db.log.Info().Msg("closing database connection pool")
	db.Pool.Close()
	return nil
}

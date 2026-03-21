# Go expense-auditor Backend

A production-ready Go backend service built with Echo framework, featuring clean architecture, comprehensive middleware, and modern DevOps practices.

## Architecture Overview

This backend follows clean architecture principles with clear separation of concerns:

```
backend/
├── cmd/expense-auditor/        # Application entry point
├── internal/                  # Private application code
│   ├── config/               # Configuration management
│   ├── database/             # Database connections and migrations
│   ├── handler/              # HTTP request handlers
│   ├── service/              # Business logic layer
│   ├── repository/           # Data access layer
│   ├── model/                # Domain models
│   ├── middleware/           # HTTP middleware
│   ├── lib/                  # Shared libraries
│   └── validation/           # Request validation
├── static/                   # Static files (OpenAPI spec)
├── templates/                # Email templates
└── Taskfile.yml              # Task automation
```

## Features

### Core Framework
- **Echo v4**: High-performance, minimalist web framework
- **Clean Architecture**: Handlers → Services → Repositories → Models
- **Dependency Injection**: Constructor-based DI for testability

### Database
- **PostgreSQL**: Primary database with pgx/v5 driver
- **Migration System**: Tern for schema versioning
- **Connection Pooling**: Optimized for production workloads
- **Transaction Support**: ACID compliance for critical operations

### Authentication & Security
- **Clerk Integration**: Modern authentication service
- **JWT Validation**: Secure token verification
- **Role-Based Access**: Configurable permission system
- **Rate Limiting**: 20 requests/second per IP
- **Security Headers**: XSS, CSRF, and clickjacking protection

### Observability
- **New Relic APM**: Application performance monitoring
- **Structured Logging**: JSON logs with Zerolog
- **Request Tracing**: Distributed tracing support
- **Health Checks**: Readiness and liveness endpoints
- **Custom Metrics**: Business-specific monitoring

### Background Jobs
- **Asynq**: Redis-based distributed task queue
- **Priority Queues**: Critical, default, and low priority
- **Job Scheduling**: Cron-like task scheduling
- **Retry Logic**: Exponential backoff for failed jobs
- **Job Monitoring**: Real-time job status tracking

### Email Service
- **Resend Integration**: Reliable email delivery
- **HTML Templates**: Beautiful transactional emails
- **Preview Mode**: Test emails in development
- **Batch Sending**: Efficient bulk operations

### API Documentation
- **OpenAPI 3.0**: Complete API specification
- **Swagger UI**: Interactive API explorer
- **Auto-generation**: Code-first approach

## Getting Started

### Prerequisites
- Go 1.24+
- PostgreSQL 16+
- Redis 8+
- Task (taskfile.dev)

### Installation

1. Install dependencies:
```bash
go mod download
```

2. Set up environment:
```bash
cp .env.example .env
# Configure your environment variables
```

3. Run migrations:
```bash
task migrations:up
```

4. Start the server:
```bash
task run
```

## Configuration

Configuration is managed through environment variables with the `EPAU_` prefix:

## Development

### Available Tasks

```bash
task help                    # Show all available tasks
task run                     # Run the application
task test                    # Run tests
task migrations:new name=X   # Create new migration
task migrations:up           # Apply migrations
task migrations:down         # Rollback last migration
task tidy                    # Format and tidy dependencies
```

### Project Structure

#### Handlers (`internal/handler/`)
HTTP request handlers that:
- Parse and validate requests
- Call appropriate services
- Format responses
- Handle HTTP-specific concerns

#### Services (`internal/service/`)
Business logic layer that:
- Implements use cases
- Orchestrates operations
- Enforces business rules
- Handles transactions

#### Repositories (`internal/repository/`)
Data access layer that:
- Encapsulates database queries
- Provides data mapping
- Handles database-specific logic
- Supports multiple data sources

#### Models (`internal/model/`)
Domain entities that:
- Define core business objects
- Include validation rules
- Remain database-agnostic

#### Middleware (`internal/middleware/`)
Cross-cutting concerns:
- Authentication/Authorization
- Request logging
- Error handling
- Rate limiting
- CORS
- Security headers

### Testing

#### Unit Tests
```bash
go test ./...
```

## Logging

Structured logging with Zerolog:

```go
log.Info().
    Str("user_id", userID).
    Str("action", "login").
    Msg("User logged in successfully")
```

Log levels:
- `debug`: Detailed debugging information
- `info`: General informational messages
- `warn`: Warning messages
- `error`: Error messages
- `fatal`: Fatal errors that cause shutdown

### Production Checklist

- [ ] Set production environment variables
- [ ] Enable SSL/TLS
- [ ] Configure production database
- [ ] Set up monitoring alerts
- [ ] Configure log aggregation
- [ ] Enable rate limiting
- [ ] Set up backup strategy
- [ ] Configure auto-scaling
- [ ] Implement graceful shutdown
- [ ] Set up CI/CD pipeline

## Performance Optimization

### Database
- Connection pooling configured
- Prepared statements for frequent queries
- Indexes on commonly queried fields
- Query optimization with EXPLAIN ANALYZE

### Caching
- Redis for session storage
- In-memory caching for hot data
- HTTP caching headers

### Concurrency
- Goroutine pools for parallel processing
- Context-based cancellation
- Proper mutex usage

## Security Best Practices

1. **Input Validation**: All inputs validated and sanitized
2. **SQL Injection**: Parameterized queries only
3. **XSS Protection**: Output encoding and CSP headers
4. **CSRF Protection**: Token-based protection
5. **Rate Limiting**: Per-IP and per-user limits
6. **Secrets Management**: Environment variables, never in code
7. **HTTPS Only**: Enforce TLS in production
8. **Dependency Scanning**: Regular vulnerability checks

## Contributing

1. Follow Go best practices and idioms
2. Write tests for new features
3. Update documentation
4. Run linters before committing
5. Keep commits atomic and well-described

## License

See the parent project's LICENSE file.



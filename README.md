# Go auditor

A production-ready monorepo template for building scalable web applications with Go backend and TypeScript frontend. Built with modern best practices, clean architecture, and comprehensive tooling.

## Features

- **Monorepo Structure**: Organized with Turborepo for efficient builds and development
- **Go Backend**: High-performance REST API with Echo framework
- **Authentication**: Integrated Clerk SDK for secure user management
- **Database**: PostgreSQL with migrations and connection pooling
- **Background Jobs**: Redis-based async job processing with Asynq
- **Observability**: New Relic APM integration and structured logging
- **Email Service**: Transactional emails with Resend and HTML templates
- **Testing**: Comprehensive test infrastructure with Testcontainers
- **API Documentation**: OpenAPI/Swagger specification
- **Security**: Rate limiting, CORS, secure headers, and JWT validation

## Project Structure

```
expense-auditor/
├── apps/backend/          # Go backend application
├── packages/         # Frontend packages (React, Vue, etc.)
├── package.json      # Monorepo configuration
├── turbo.json        # Turborepo configuration
└── README.md         # This file
```

## Quick Start

### Prerequisites

- Go 1.24 or higher
- Node.js 22+ and Bun
- PostgreSQL 16+
- Redis 8+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/sriniously/expense-auditor.git
cd expense-auditor
```

2. Install dependencies:
```bash
# Install frontend dependencies
bun install

# Install backend dependencies
cd apps/backend
go mod download
```

3. Set up environment variables:
```bash
cp apps/backend/.env.example apps/backend/.env
# Edit apps/backend/.env with your configuration
```

4. Start the database and Redis.

5. Run database migrations:
```bash
cd apps/backend
task migrations:up
```

6. Start the development server:
```bash
# From root directory
bun dev

# Or just the backend
cd apps/backend
task run
```

The API will be available at `http://localhost:8080`

## Development

### Available Commands

```bash
# Backend commands (from backend/ directory)
task help              # Show all available tasks
task run               # Run the application
task migrations:new    # Create a new migration
task migrations:up     # Apply migrations
task test              # Run tests
task tidy              # Format code and manage dependencies

# Frontend commands (from root directory)
bun dev                # Start development servers
bun build              # Build all packages
bun lint               # Lint all packages
```

### Environment Variables

The backend uses environment variables prefixed with `EPAU_`. Key variables include:

- `EPAU_DATABASE_*` - PostgreSQL connection settings
- `EPAU_SERVER_*` - Server configuration
- `EPAU_AUTH_*` - Authentication settings
- `EPAU_REDIS_*` - Redis connection
- `EPAU_EMAIL_*` - Email service configuration
- `EPAU_OBSERVABILITY_*` - Monitoring settings

See `apps/backend/.env.example` for a complete list.

## Architecture

This auditor follows clean architecture principles:

- **Handlers**: HTTP request/response handling
- **Services**: Business logic implementation
- **Repositories**: Data access layer
- **Models**: Domain entities
- **Infrastructure**: External services (database, cache, email)

## Testing

```bash
# Run backend tests
cd apps/backend
go test ./...

# Run with coverage
go test -cover ./...

# Run integration tests (requires Docker)
go test -tags=integration ./...
```

### Production Considerations

1. Use environment-specific configuration
2. Enable production logging levels
3. Configure proper database connection pooling
4. Set up monitoring and alerting
5. Use a reverse proxy (nginx, Caddy)
6. Enable rate limiting and security headers
7. Configure CORS for your domains

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.




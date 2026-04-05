# Backend

The backend is the system of record for claims, policies, audits, and organization-scoped authorization. It exposes the HTTP API, runs background jobs, stores claims and policy metadata, and coordinates the OCR plus audit pipeline.

## Responsibilities

- accept claim uploads
- persist claim state transitions
- run OCR and policy-matching jobs
- store and retrieve active policy data
- enforce org and role boundaries with Clerk
- expose admin claim review endpoints
- generate and serve OpenAPI documentation

## High-Level Flow

1. `POST /api/v1/claims` accepts a receipt upload plus business purpose and expense metadata.
2. A background OCR job extracts merchant, date, amount, and currency.
3. OCR validation checks unreadable receipts, date mismatch, and business-purpose consistency.
4. Policy ingestion jobs chunk and embed the active policy PDF into pgvector-backed search data.
5. Audit jobs retrieve relevant policy chunks and ask Gemini for a structured decision.
6. Results are stored on the claim and surfaced to employees and admins.

## Tech Stack

- Go `1.25`
- Echo
- PostgreSQL + pgx + pgvector
- Redis + Asynq
- Clerk Go SDK
- Gemini API
- Google Cloud Storage
- Zerolog + optional New Relic integration

## Folder Guide

```text
apps/backend/
|-- cmd/expense-auditor/        # main application entry point
|-- internal/
|   |-- cache/                  # Redis key helpers and cache helpers
|   |-- config/                 # environment-backed configuration
|   |-- database/               # pgx setup and migrations
|   |-- handler/                # HTTP handlers and request binding
|   |-- lib/
|   |   |-- gemini/             # OCR, embeddings, audit, PDF extraction
|   |   |-- job/                # Asynq job handlers
|   |   `-- email/              # email helpers
|   |-- middleware/             # auth, context enrichment, security
|   |-- model/                  # domain types
|   |-- repository/             # database access
|   |-- router/                 # route registration
|   |-- server/                 # process wiring
|   |-- service/                # business logic
|   `-- testing/                # testcontainers-backed integration helpers
|-- static/                     # generated OpenAPI JSON
|-- compose.yaml                # local Postgres + Redis
|-- Dockerfile
`-- Taskfile.yml
```

## API Surface

### System

- `GET /status`
- `GET /docs`
- `GET /static/openapi.json`

### Claims

- `POST /api/v1/claims`
- `GET /api/v1/claims`
- `GET /api/v1/claims/:id`
- `GET /api/v1/claims/:id/receipt`
- `GET /api/v1/claims/:id/audit`

### Admin Claim Review

- `GET /api/v1/admin/claims`
- `POST /api/v1/admin/claims/:id/recompute-policy`

### Policy

- `GET /api/v1/policy/active`
- `GET /api/v1/policy/active/download`
- `POST /api/v1/admin/policy`
- `GET /api/v1/admin/policy`
- `GET /api/v1/admin/policy/:id`

### Organization

- `POST /api/v1/admin/organization/invitations`

## Local Setup

### Prerequisites

- Go `1.25+`
- Docker
- `task`
- `tern`

### Start Local Services

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
docker compose up -d
```

Local compose ports:

- Postgres: `15432`
- Redis: `16316`

### Configure Environment

Copy:

```bash
Copy-Item .env.sample .env
```

Minimum values to verify:

```dotenv
EXPAU_PRIMARY.ENV="local"
EXPAU_SERVER.PORT="8080"
EXPAU_SERVER.CORS_ALLOWED_ORIGINS="http://localhost:5173"

EXPAU_DATABASE.HOST="localhost"
EXPAU_DATABASE.PORT="15432"
EXPAU_DATABASE.USER="postgres"
EXPAU_DATABASE.PASSWORD="postgres"
EXPAU_DATABASE.NAME="auditor"
EXPAU_DATABASE.SSL_MODE="disable"

EXPAU_REDIS.ADDRESS="localhost:16316"

EXPAU_AUTH.SECRET_KEY="your-clerk-secret-key"
EXPAU_INTEGRATION.RESEND_API_KEY="your-resend-api-key"
EXPAU_INTEGRATION.RESEND_FROM="Expense Auditor <onboarding@your-domain.com>"

EXPAU_AI.GEMINI_API_KEY="your-gemini-api-key"
EXPAU_AI.DATE_MISMATCH_THRESHOLD="7"

EXPAU_STORAGE.GCS_BUCKET_NAME="your-gcs-bucket"
EXPAU_STORAGE.GCS_PROJECT_ID="your-gcp-project"
EXPAU_STORAGE.GCS_CREDENTIALS="service-account-json-or-path"
EXPAU_STORAGE.MAX_FILE_SIZE_MB="10"
```

Notes:

- New Relic is optional locally.
- GCS is required for real upload flows.
- Gemini is required for OCR, policy extraction, embeddings, and auditing.

### Run Migrations

```bash
task migrations:up
```

### Run The API

```bash
task run
```

The API starts on `http://localhost:8080`.

## Useful Commands

```bash
task help
task run
task migrations:new name=your_migration
task migrations:up
task tidy
go test ./...
```

## Testing

### Fast Test Pass

```bash
go test ./...
```

### Integration-Style Database Tests

Use the helpers in `internal/testing` when you need a real migrated Postgres instance in tests:

- `SetupTestDB(t)`
- `SetupTest(t)`
- `WithRollbackTransaction(...)`

These helpers use Testcontainers, so Docker must be running.

## Implementation Notes

### Claims And Audit Pipeline

- claim creation is synchronous at the HTTP layer and asynchronous for OCR / audit
- OCR and audit jobs live under `internal/lib/job`
- AI wrappers live under `internal/lib/gemini`
- cached claim and queue reads live under `internal/cache`

### Admin Review Queue

- admin access is enforced by route middleware and service-level authorization
- the initial authorized queue comes from the backend
- current UI filtering is performed in the frontend after the initial fetch
- backend filtered query support still exists for future pagination / larger datasets

### OpenAPI

The generated OpenAPI JSON is served from `apps/backend/static/openapi.json`. The source of truth for contract generation lives in `packages/openapi`.

## Current Gaps Relative To The PDF Brief

- no complete auditor override / dispute workflow yet
- no dedicated risk score model yet
- no full claim notification workflow yet
- no final side-by-side audit workstation layout yet

## Deployment Notes

For production, plan for:

- managed Postgres with pgvector enabled
- managed Redis
- Clerk production keys
- a production GCS bucket and service account
- Gemini API quotas and monitoring
- log aggregation and alerting
- a deployment workflow that regenerates OpenAPI on contract changes

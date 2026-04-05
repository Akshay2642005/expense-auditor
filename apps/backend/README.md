# Backend

The backend is the system of record for claims, policies, audits, notifications, and organization-scoped authorization. It exposes the HTTP API, runs background jobs, stores claim and policy metadata, and coordinates the OCR plus audit pipeline.

## What The Backend Owns

- claim creation and claim state transitions
- organization-scoped authorization and admin-only boundaries
- OCR, policy ingestion, embeddings, and audit jobs
- policy storage and active-policy retrieval
- admin claim review data, override persistence, and review history
- organization invitations and membership role updates
- outcome email notifications
- OpenAPI generation and serving

## Implemented Backend Capabilities

### Claims and OCR

- multipart claim submission with receipt file upload
- OCR extraction for merchant, amount, currency, and receipt date
- unreadable-receipt and date-mismatch handling
- business-purpose consistency checks before audit

### Policy and audit

- policy PDF upload and active-policy management
- policy extraction, chunking, embedding, and pgvector retrieval
- Gemini-backed audit decisions with cited policy text
- policy recompute from the admin review flow
- preserved AI audit history even after human overrides

### Admin workflow

- admin queue API
- admin claim detail API with:
  - latest audit
  - full audit history
  - linked policy chunks
- manual override endpoint with reviewer comment support
- org-admin-only invitation and member-role update endpoints

### Notifications

- async claim outcome emails for approved, rejected, and clarification-needed outcomes
- stale-email suppression when a claim changes status again before send time

## High-Level Flow

1. `POST /api/v1/claims` accepts a multipart receipt plus business metadata.
2. A background OCR job extracts key receipt fields.
3. OCR validation checks unreadable receipts, date mismatch, and business-purpose consistency.
4. Active policy PDFs are chunked and embedded into pgvector-backed retrieval data.
5. Audit jobs retrieve the most relevant policy chunks and ask Gemini for a decision.
6. Results are stored on the claim, surfaced through member/admin endpoints, and may trigger outcome emails.
7. Admins can override the automated outcome while preserving the original AI trail.

## Tech Stack

- Go `1.25`
- Echo
- PostgreSQL + pgx + pgvector
- Redis + Asynq
- Clerk Go SDK
- Gemini API
- Google Cloud Storage
- Resend
- Zerolog + optional New Relic integration

## Folder Guide

```text
apps/backend/
|-- cmd/expense-auditor/        # application entry point
|-- internal/
|   |-- cache/                  # Redis key helpers and caching
|   |-- config/                 # environment-backed configuration
|   |-- database/               # pgx setup and migrations
|   |-- handler/                # HTTP handlers and request binding
|   |-- lib/
|   |   |-- email/              # email client and templates
|   |   |-- gemini/             # OCR, embeddings, audit, PDF extraction
|   |   `-- job/                # Asynq job types and handlers
|   |-- middleware/             # auth, org-admin guards, security
|   |-- model/                  # domain types
|   |-- repository/             # database access
|   |-- router/                 # route registration
|   |-- server/                 # process wiring
|   |-- service/                # business logic
|   `-- testing/                # Testcontainers-backed helpers
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

### Admin claim review

- `GET /api/v1/admin/claims`
- `GET /api/v1/admin/claims/:id`
- `PATCH /api/v1/admin/claims/:id/override`
- `POST /api/v1/admin/claims/:id/recompute-policy`

### Policy

- `GET /api/v1/policy/active`
- `GET /api/v1/policy/active/download`
- `POST /api/v1/admin/policy`
- `GET /api/v1/admin/policy`
- `GET /api/v1/admin/policy/:id`

### Organization

- `POST /api/v1/admin/organization/invitations`
- `PATCH /api/v1/admin/organization/members/:userId/role`

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

Copy the sample:

```bash
Copy-Item .env.sample .env
```

Verify these minimum values:

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
EXPAU_DATABASE.MAX_OPEN_CONNS="25"
EXPAU_DATABASE.MAX_IDLE_CONNS="25"
EXPAU_DATABASE.CONN_MAX_LIFETIME="300s"
EXPAU_DATABASE.CONN_MAX_IDLE_TIME="300s"

EXPAU_REDIS.ADDRESS="localhost:16316"

EXPAU_AUTH.SECRET_KEY="your-clerk-secret-key"

EXPAU_INTEGRATION.RESEND_API_KEY="your-resend-api-key"
EXPAU_INTEGRATION.RESEND_FROM="Expense Auditor <onboarding@your-domain.com>"

EXPAU_AI.GEMINI_API_KEY="your-gemini-api-key"
EXPAU_AI.DATE_MISMATCH_THRESHOLD="7"

EXPAU_STORAGE.GCS_BUCKET_NAME="your-bucket"
EXPAU_STORAGE.GCS_PROJECT_ID="your-project"
EXPAU_STORAGE.GCS_CREDENTIALS="service-account-json-or-path"
EXPAU_STORAGE.MAX_FILE_SIZE_MB="10"
```

Notes:

- New Relic is optional locally.
- GCS is required for real receipt and policy uploads.
- Gemini is required for OCR, policy extraction, embeddings, and auditing.
- Resend is required if you want to exercise real outcome-email sending locally.

### Run Migrations

```bash
task migrations:up
```

### Run The API And Worker

```bash
task run
```

The API starts on `http://localhost:8080`, and the same process also starts the Asynq worker used for OCR, audit, policy, and email jobs.

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

### Fast test pass

```bash
go test ./...
```

### Integration-style database tests

Use the helpers in `internal/testing` when you need a real migrated Postgres instance in tests:

- `SetupTestDB(t)`
- `SetupTest(t)`
- `WithRollbackTransaction(...)`

These helpers use Testcontainers, so Docker must be running.

## Implementation Notes

### Claim and audit pipeline

- claim creation is synchronous at the HTTP layer and asynchronous for OCR and audit
- OCR, policy ingestion, audit, and email jobs live under `internal/lib/job`
- Gemini wrappers live under `internal/lib/gemini`
- queue and detail reads use Redis-backed caching where it fits the flow

### Admin review

- admin access is enforced by route middleware and service-level authorization
- admin queue filtering is performed client-side after the initial authorized fetch
- the backend still keeps dedicated admin detail and override endpoints for durable review operations

### Notifications

- claim outcome notifications are async
- stale queued notifications are skipped if claim state has moved on
- the sender address comes from `EXPAU_INTEGRATION.RESEND_FROM`

### OpenAPI

The generated OpenAPI JSON is served from `apps/backend/static/openapi.json`. The source of truth for contract generation lives in `packages/openapi`.

## Current Gaps

- no explicit risk score model yet
- no analytics or export endpoints yet
- no full dispute / reopen workflow yet
- policy rules still need broader structured enforcement beyond the current retrieval-backed reasoning and cap extraction

## Deployment Notes

The current documented production path for this repo is:

- a minimal DigitalOcean droplet provisioned from `packages/infra`
- Dokploy on that droplet
- PostgreSQL + Redis as a Dokploy compose stack
- frontend and backend deployed as separate Dokploy applications

See:

- [packages/infra/README.md](../../packages/infra/README.md)
- [docs/digitalocean-deployment.md](../../docs/digitalocean-deployment.md)

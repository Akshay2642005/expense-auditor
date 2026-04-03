# Expense Auditor

Expense Auditor is a policy-first expense compliance platform built from the "Policy-First Expense Auditor" PDF brief in this repository. The system combines receipt OCR, policy retrieval, AI-assisted auditing, and an admin review workflow so organizations can move from manual receipt review to a faster, more consistent audit loop.

This monorepo contains:

- a Go backend API and job runner
- a React frontend for employees and finance admins
- a shared Zod schema package
- a shared OpenAPI contract package

## Product Summary

The product currently supports the core loop:

1. An employee signs in, joins an organization, and submits a receipt with a business purpose.
2. The backend stores the file, runs OCR, validates the receipt, and checks for date mismatch or unreadable input.
3. The organization's active policy PDF is chunked, embedded, and retrieved during audit.
4. Gemini-based audit logic compares the receipt, the business purpose, and the relevant policy excerpts.
5. The claim is categorized as approved, flagged, rejected, or routed to manual review.
6. Admins review claims in a dedicated queue with search, filters, uploader visibility, and claim detail pages.

## Status Against The PDF Brief

The PDF lives at [2.Expense auditor.pdf](./2.Expense%20auditor.pdf).

### Implemented Now

- Digital receipt ingestion for `JPG`, `PNG`, and `PDF`.
- OCR extraction of merchant name, receipt date, total amount, and currency.
- Business purpose capture during claim submission.
- OCR validation for unreadable receipts and date mismatch handling.
- Organization-scoped policy upload, activation, visibility, and PDF download.
- Policy ingestion pipeline using PDF extraction, chunking, embeddings, and pgvector retrieval.
- Automated policy cross-reference during audit.
- Business-purpose consistency checking during the OCR / review pipeline.
- Traffic-light claim outcomes: `approved`, `flagged`, `rejected`, plus intermediate workflow statuses.
- AI-generated audit explanations and cited policy text on claim detail pages.
- Admin review queue with uploader visibility, local search, filtering, and sorting.
- Clerk-based custom auth, SSO callback handling, invitation acceptance, and organization onboarding.

### Partially Implemented Or Needs Product Polish

- Finance home page sorted by explicit risk level.
  Today: admins can sort and filter the queue, but there is no dedicated risk score model yet.
- Audit detail workspace as a true side-by-side reviewer cockpit.
  Today: the claim detail page shows the claim, audit result, and supporting information, but not the full "receipt | extracted fields | policy snippet" layout from the brief.
- Notification system for employee approval / clarification.
  Today: the repo has email plumbing and invitation flows, but claim-state notification UX is not complete.
- Human-in-the-loop override and dispute workflow.
  Today: the brief calls for explicit auditor override comments; this still needs a full backend + UI workflow.

### Future Improvements

- Region-aware and seniority-aware policy enforcement beyond the current cap extraction.
- Stronger prohibition detection such as alcohol bans, merchant restrictions, and category-specific exceptions.
- Bulk admin actions, saved searches, and queue presets.
- Duplicate receipt detection and broader fraud heuristics.
- Full OpenAPI coverage for policy, audit, and organization endpoints.
- Stronger evaluation harnesses for OCR quality, retrieval accuracy, and false positive / false negative audit outcomes.

## Monorepo Layout

```text
expense-auditor/
|-- apps/
|   |-- backend/      # Go API, background jobs, migrations, storage, AI pipeline
|   `-- frontend/     # React app for employees and finance admins
|-- packages/
|   |-- zod/          # Shared schema definitions and TypeScript types
|   `-- openapi/      # Shared ts-rest contracts and generated OpenAPI JSON
|-- 2.Expense auditor.pdf
|-- package.json
|-- turbo.json
`-- README.md
```

## Architecture Overview

### Backend

- Echo-based REST API
- PostgreSQL + pgvector
- Redis + Asynq background jobs
- Google Cloud Storage for uploaded receipts and policy files
- Gemini for OCR, PDF extraction, embeddings, business-purpose checks, and audit decisions
- Clerk for authentication and organization-aware authorization

### Frontend

- React 19 + Vite
- Clerk React for auth
- React Router for app navigation
- React Query for server state and caching
- Shadcn/Radix-style UI building blocks
- Shared schema and contract packages from `packages/zod` and `packages/openapi`

### Shared Packages

- `@auditor/zod` is the shared source of truth for API response / query shapes.
- `@auditor/openapi` turns the ts-rest contracts into OpenAPI JSON and syncs a copy into the backend static docs folder.

## Local Development Setup

### Prerequisites

- Go `1.25+`
- Node.js `22+`
- Bun `1.2+`
- Docker Desktop or another Docker runtime
- `task` CLI
- `tern` migration CLI

Helpful install commands:

```bash
go install github.com/go-task/task/v3/cmd/task@latest
go install github.com/jackc/tern/v2@latest
```

### 1. Install Root And Frontend Dependencies

```bash
cd C:\dev\Projects\expense-auditor
bun install
```

### 2. Install Backend Go Dependencies

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
go mod download
```

### 3. Start Local Infrastructure

The backend ships with Docker Compose for Postgres and Redis.

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
docker compose up -d
```

Default local ports from `compose.yaml`:

- PostgreSQL: `localhost:15432`
- Redis: `localhost:16316`

### 4. Configure Backend Environment

Copy the sample file:

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
Copy-Item .env.sample .env
```

Use the sample file as a base, then make sure the values line up with your local frontend and your real service credentials.

At minimum, verify or supply:

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

EXPAU_AI.GEMINI_API_KEY="your-gemini-api-key"
EXPAU_AI.DATE_MISMATCH_THRESHOLD="7"

EXPAU_STORAGE.GCS_BUCKET_NAME="your-gcs-bucket"
EXPAU_STORAGE.GCS_PROJECT_ID="your-gcp-project"
EXPAU_STORAGE.GCS_CREDENTIALS="path-or-json-for-service-account"
EXPAU_STORAGE.MAX_FILE_SIZE_MB="10"
```

Notes:

- `EXPAU_SERVER.CORS_ALLOWED_ORIGINS` should match the Vite frontend origin.
- New Relic is optional for local development; the logger service will run without a license key.
- Receipt and policy uploads depend on working GCS credentials.
- AI features depend on a valid Gemini API key.

### 5. Configure Frontend Environment

Create `apps/frontend/.env` if needed and make sure it contains:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_or_pk_live_value
VITE_API_URL=http://localhost:8080
VITE_ENV=local
```

### 6. Run Database Migrations

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
task migrations:up
```

### 7. Build Shared Packages Once

The frontend waits for the shared packages to exist, so do an initial build first.

```bash
cd C:\dev\Projects\expense-auditor\packages\zod
bun run build

cd C:\dev\Projects\expense-auditor\packages\openapi
bun run build
bun run gen
```

### 8. Start The Backend

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
task run
```

The backend will be available at `http://localhost:8080`.

Useful endpoints:

- `GET /status`
- `GET /docs`

### 9. Start The Frontend

Open a second terminal:

```bash
cd C:\dev\Projects\expense-auditor
bun dev
```

The Vite frontend typically runs at `http://localhost:5173`.

## Common Development Commands

### Root

```bash
bun dev
bun build
bun typecheck
bun lint
```

### Backend

```bash
cd apps/backend
task help
task run
task migrations:new name=add_something
task migrations:up
go test ./...
```

### Frontend

```bash
cd apps/frontend
bun run dev
bun run typecheck
bun run build
```

### Shared Packages

```bash
cd packages/zod
bun run build

cd packages/openapi
bun run build
bun run gen
```

## Testing

### Backend

- Unit and service tests: `go test ./...`
- Integration-style DB tests: use `apps/backend/internal/testing`
- Container-backed testing requires Docker

### Frontend

- Type safety: `bun run typecheck`
- Production build verification: `bun run build`
- Frontend tests can run with `bun run test`

## Documentation Map

- [Root README](./README.md): product overview, setup, roadmap
- [Backend README](./apps/backend/README.md): API, jobs, envs, backend architecture
- [Frontend README](./apps/frontend/README.md): routes, UX flows, frontend setup
- [Zod README](./packages/zod/README.md): shared schema package
- [OpenAPI README](./packages/openapi/README.md): contract generation and OpenAPI output

## Recommended Next Product Steps

If you want to finish the original PDF brief with the highest leverage work next, focus here:

1. Add explicit auditor override comments and a dispute workflow.
2. Introduce risk scoring so admins see truly high-risk claims first.
3. Build the side-by-side audit detail workspace from the brief.
4. Add claim approval / clarification notifications.
5. Expand policy rule extraction beyond basic caps and text snippets.

## License

This repository is licensed under the terms in [LICENSE](./LICENSE).

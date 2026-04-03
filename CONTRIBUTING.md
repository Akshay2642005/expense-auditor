# Contributing to Expense Auditor

Thanks for contributing to Expense Auditor. This repository is a monorepo for an AI-assisted expense auditing platform with a Go backend, a React frontend, and shared schema and contract packages.

## Project Description

Expense Auditor helps organizations validate employee expense claims by combining receipt OCR, policy retrieval, AI-assisted reasoning, and a finance-admin review workflow.

## Before You Start

- Read the root [README.md](./README.md) for product context and workspace layout.
- Read [apps/backend/README.md](./apps/backend/README.md) or [apps/frontend/README.md](./apps/frontend/README.md) if your change is app-specific.
- Check the active GitHub issues and roadmap project before starting new work.
- Prefer small, focused changes over broad refactors unless the issue explicitly calls for larger architecture work.

## Local Setup

### Prerequisites

- `Bun 1.2+`
- `Node.js 22+`
- `Go 1.25+`
- Docker Desktop for local Postgres and Redis

### Bootstrap

1. Install root dependencies:

   ```bash
   bun install
   ```

2. Start local infrastructure for the backend:

   ```bash
   cd apps/backend
   docker compose up -d
   ```

3. Configure environment files for the frontend and backend.
4. Build shared packages before starting the frontend if needed:

   ```bash
   cd packages/zod && bun run build
   cd ../openapi && bun run build
   ```

5. Start the apps you need:

   ```bash
   cd apps/backend && go run ./cmd/api
   cd apps/frontend && bun run dev
   ```

For detailed setup, use the package and app READMEs instead of duplicating every environment variable here.

## Repository Structure

```text
apps/
  backend/   Go API, background jobs, migrations, AI pipeline
  frontend/  React app for employees and finance admins
packages/
  zod/       Shared Zod schemas and inferred TypeScript types
  openapi/   Shared ts-rest contracts and generated OpenAPI artifacts
```

## Branching And Scope

- Use a focused branch per issue or change.
- Keep unrelated fixes in separate branches and PRs.
- When working from a GitHub issue, mention the issue number in commits or PR descriptions when it helps traceability.

## Coding Expectations

### General

- Follow the existing project structure and naming patterns.
- Preserve established architecture boundaries between backend, frontend, and shared packages.
- Avoid introducing new dependencies unless they are justified by the issue.
- Prefer readable, explicit code over clever abstractions.

### Backend

- Keep business rules in service or domain-oriented layers rather than handlers.
- Respect repository boundaries and existing model conventions.
- Add or update migrations for schema changes.
- Keep authorization and org-scoping behavior explicit.

### Frontend

- Reuse existing UI primitives and project patterns where possible.
- Preserve the existing visual language unless the task is intentionally redesign-oriented.
- Handle loading, empty, and error states for user-facing flows.
- Keep admin and member experiences clearly separated when the product requires it.

### Shared Packages

- Update `packages/zod` when request or response shapes change.
- Update `packages/openapi` when API contracts change.
- Regenerate contract artifacts if your change affects the API surface.

## Testing And Verification

Run the smallest relevant set first, then expand if your change crosses boundaries.

### Common Commands

```bash
bun run typecheck
bun run build
```

### Backend

```bash
cd apps/backend
go test ./...
```

### Frontend

```bash
cd apps/frontend
bun run typecheck
bun run build
```

### Shared Packages

```bash
cd packages/zod && bun run build
cd packages/openapi && bun run build && bun run gen
```

## Pull Request Expectations

Every pull request should:

- explain what changed and why
- link the relevant issue when there is one
- describe how the change was tested
- include screenshots or recordings for meaningful UI changes
- mention any migrations, contract changes, or follow-up work

Small, well-scoped PRs are much easier to review than mixed-scope changes.

## Documentation Expectations

Update documentation when your change affects:

- setup steps
- environment variables
- API contracts
- user flows
- feature status in the root README

## Good First Contribution Areas

- documentation improvements
- targeted UI polish
- test coverage improvements
- small workflow bugs
- contract and schema consistency fixes

## Questions

If a task is ambiguous, start from an issue, describe assumptions in your PR, and keep the implementation narrow enough that review can correct course quickly.

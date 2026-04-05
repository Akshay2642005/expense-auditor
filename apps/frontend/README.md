# Frontend

The frontend is the user-facing layer for employees and finance admins. It handles authentication, organization onboarding, claim submission, policy visibility, claim detail views, the admin review queue, and admin profile management.

## Implemented User Journeys

### Employee

- sign up or sign in with Clerk
- complete SSO callbacks
- accept an invitation into an organization inside the app
- submit a receipt with business purpose and claim metadata
- track OCR and audit progress under `/claims`
- inspect audit explanations and cited policy text
- view and download the active policy

### Admin

- land in a dedicated admin queue under `/admin/claims`
- inspect uploader identity for every claim
- search, filter, and sort claims locally after the initial authorized fetch
- open admin-only claim detail pages under `/admin/claims/:id`
- preview receipts inline
- inspect receipt snapshot and employee submission metadata
- view matched policy evidence and review history in popups
- save manual override decisions with reviewer comments
- re-run policy matching
- invite members as either `member` or `admin`
- manage member roles from the admin profile tabs

## Current Routes

Defined in [App.tsx](./src/App.tsx):

- `/login`
- `/signup`
- `/verify-email`
- `/sso-callback`
- `/accept-invitation`
- `/create-org`
- `/`
  - redirects to `/claims` for members
  - redirects to `/admin/claims` for admins
- `/claims`
- `/claims/new`
- `/claims/:id`
- `/profile`
- `/policy`
- `/admin/claims`
- `/admin/claims/:id`
- `/admin/profile`
- `/admin/policy`

## Main Feature Areas

### Auth and organization

- custom Clerk login and signup flows
- bot-protection-compatible CAPTCHA mounting
- SSO callback handling
- organization creation
- invitation acceptance flow inside the app
- automatic org activation for signed-in members
- tabbed admin profile with `Me` and `Members`
- member promote/demote controls for org admins

### Claims

- claim submission form with file upload and business purpose
- member claim list and claim status pages
- audit explanation and cited policy text
- admin claim detail workspace with:
  - receipt preview
  - receipt snapshot
  - employee submission facts
  - reviewer override form
  - matched policy popup
  - review history popup

### Policy

- active policy visibility for all authenticated members
- admin policy management
- active policy download

### Admin queue

- uploader visibility
- search by claim text and identifiers
- filter by status, uploader, flagged state, and date range
- sorting by submitted date, claimed date, amount, status, or merchant
- compact review filter rail

## Frontend Architecture

### State and data

- Clerk for auth state
- React Query for server state and cache coordination
- Axios for multipart upload and binary download flows
- shared contracts and schemas from `@auditor/openapi` and `@auditor/zod`

### Rendering approach

- route-level pages under `src/features`
- reusable UI primitives under `src/components/ui`
- claim detail UI split into reusable feature components under `src/features/claims/components/detail`
- claim list and submit flows split into reusable components and hooks
- environment validation in `src/config/env.ts`

## Local Setup

### Prerequisites

- Bun `1.2+`
- Node.js `22+`
- backend API running locally
- generated shared packages built at least once

### Environment

Create `apps/frontend/.env` with:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_test_or_pk_live_value
VITE_API_URL=http://localhost:8080
VITE_ENV=local
```

### Install and run

```bash
cd C:\dev\Projects\expense-auditor
bun install
```

Build the shared packages once:

```bash
cd C:\dev\Projects\expense-auditor\packages\zod
bun run build

cd C:\dev\Projects\expense-auditor\packages\openapi
bun run build
bun run gen
```

Then start the frontend:

```bash
cd C:\dev\Projects\expense-auditor
bun dev
```

Vite typically runs on `http://localhost:5173`.

## Commands

```bash
cd apps/frontend
bun run dev
bun run typecheck
bun run build
bun run test
bun run lint
bun run format:fix
```

## Folder Guide

```text
apps/frontend/src/
|-- api/                # HTTP clients and typed contract usage
|-- components/         # shared UI and layout primitives
|-- config/             # validated env config
|-- features/
|   |-- auth/           # auth, profile, org onboarding, invite acceptance
|   |-- claims/         # submit, list, detail, admin review workspace
|   `-- policy/         # policy pages
|-- hooks/              # organization-ready and member-directory hooks
|-- lib/                # shared utilities
`-- App.tsx             # route tree
```

## Implementation Notes

### Admin queue search strategy

The admin queue uses a hybrid pattern:

- the backend returns the authorized admin claim dataset once
- the browser handles search, filter, and sort interactions locally

That keeps authorization on the server without turning every keystroke into a network request.

### Shared packages

- `@auditor/zod` provides the shared TypeScript shapes used in the UI
- `@auditor/openapi` provides the ts-rest contracts used by the API layer

### Frontend deployment behavior

- `VITE_*` values are build-time inputs
- changing `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, or `VITE_ENV` requires a rebuild

## Current Gaps

- no explicit risk-first ranking model yet
- no analytics or export views yet
- no in-app notification center yet
- no reopen / dispute workflow layered on top of the current override trail yet

## Recommended Frontend Next Steps

1. Add risk scoring and risk-aware queue ordering.
2. Add analytics and export UX for finance admins.
3. Add an in-app notification inbox and settings.
4. Add reopen / dispute UX on top of the current reviewer override flow.

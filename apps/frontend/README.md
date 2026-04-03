# Frontend

The frontend is the user-facing layer for employees and finance admins. It handles authentication, organization onboarding, claim submission, policy visibility, claim detail views, and the admin review queue.

## Core User Journeys

### Employee

- sign up or sign in with Clerk
- accept an invitation into an organization
- submit a receipt with business purpose and claim metadata
- track OCR and audit progress
- inspect audit explanations and cited policy text
- view the active policy

### Admin

- access the admin review queue
- inspect who uploaded each claim
- search, filter, and sort claims locally after the initial authorized fetch
- manage policies
- invite members into the organization

## Current Routes

Defined in [App.tsx](./src/App.tsx):

- `/login`
- `/signup`
- `/verify-email`
- `/sso-callback`
- `/accept-invitation`
- `/create-org`
- `/`
- `/claims/new`
- `/claims/:id`
- `/profile`
- `/policy`
- `/admin/policy`

## Main Feature Areas

### Auth And Organization

- custom Clerk login and signup flows
- bot-protection-compatible CAPTCHA mounting
- SSO callback handling
- organization creation
- invite acceptance flow inside the app
- automatic org activation for signed-in members

### Claims

- claim submission form with file upload and business purpose
- claim status page with OCR / audit state
- audit explanation and cited policy text
- receipt preview and review-oriented detail rendering

### Policy

- active policy visibility for all authenticated members
- admin policy management
- active policy download

### Admin Queue

- uploader visibility
- search by claim text and identifiers
- filter by status, uploader, flagged state, and date range
- sorting by submitted date, claimed date, amount, status, or merchant
- compact review filter rail

## Frontend Architecture

### State And Data

- Clerk for auth state
- React Query for server state and cache coordination
- Axios for multipart and simple HTTP calls
- shared contracts and schemas from `@auditor/openapi` and `@auditor/zod`

### Rendering Approach

- route-level pages under `src/features`
- reusable UI primitives under `src/components/ui`
- feature-specific hooks under `src/hooks`
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

### Install And Run

```bash
cd C:\dev\Projects\expense-auditor
bun install
```

Do an initial shared-package build:

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
|-- api/                # HTTP clients
|-- components/         # shared UI and layout primitives
|-- config/             # validated env config
|-- features/
|   |-- auth/           # auth, profile, org onboarding, invite acceptance
|   |-- claims/         # submit, list, detail, audit-centric UI
|   `-- policy/         # policy pages
|-- hooks/              # organization-ready and member-directory hooks
|-- lib/                # shared utilities
`-- App.tsx             # route tree
```

## Implementation Notes

### Admin Queue Search Strategy

The admin queue now uses a hybrid pattern:

- the backend returns the authorized admin claim dataset once
- the browser handles search, filter, and sort interactions locally

That keeps authorization on the server without turning every keystroke into a network request.

### Shared Packages

- `@auditor/zod` provides the frontend-safe TypeScript types
- `@auditor/openapi` provides the contract definitions used by clients and generated docs

## Current Gaps Relative To The Product Brief

- no final side-by-side audit cockpit yet
- no explicit human override / dispute UI yet
- no complete employee notification center yet
- no explicit risk-first ranking model yet

## Recommended Frontend Next Steps

1. Add a true audit workstation layout for finance reviewers.
2. Add override, dispute, and reviewer comment UX.
3. Add employee notification and clarification prompts.
4. Add empty / loading / error polish around long-running claim states.

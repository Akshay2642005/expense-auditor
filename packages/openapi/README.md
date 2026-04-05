# @auditor/openapi

`@auditor/openapi` is the contract-generation package for the monorepo. It turns ts-rest route contracts into OpenAPI JSON and keeps a generated copy in the backend so `/docs` can serve the latest API spec.

## Responsibilities

- define API contracts in code
- generate OpenAPI JSON from those contracts
- copy generated docs into the backend static folder
- provide typed contracts to the frontend API layer

## Inputs And Outputs

### Inputs

- contract files under `src/contracts`
- schemas from `@auditor/zod`

### Outputs

- `packages/openapi/openapi.json`
- `apps/backend/static/openapi.json`

The generation logic lives in [src/gen.ts](./src/gen.ts).

## Current Coverage

The package currently generates contracts for:

- health routes
- member claim routes
- admin claim queue, detail, override, and recompute routes
- audit result routes
- active policy, admin policy list/upload/detail routes
- organization invitation and member-role update routes

Not every backend endpoint is contract-driven yet. Binary download and some direct streaming endpoints still sit outside the current ts-rest contract layer.

## Build And Generation Commands

Build the package:

```bash
cd C:\dev\Projects\expense-auditor\packages\openapi
bun run build
```

Generate OpenAPI JSON:

```bash
bun run gen
```

Watch mode:

```bash
bun run dev
```

Clean artifacts:

```bash
bun run clean
```

## Package Structure

```text
packages/openapi/
|-- src/
|   |-- contracts/      # ts-rest route contracts
|   |-- gen.ts          # writes generated JSON files
|   |-- index.ts        # OpenAPI generation entrypoint
|   `-- utils.ts
|-- dist/
|-- openapi.json
`-- README.md
```

## How To Add A New Contract

1. Define or update the route contract in `src/contracts`.
2. Reuse schemas from `@auditor/zod` wherever possible.
3. Export the contract through `src/contracts/index.ts` if needed.
4. Run:

```bash
bun run build
bun run gen
```

5. Confirm the backend copy at `apps/backend/static/openapi.json` changed as expected.

## How It Fits Into The Repo

- the backend serves the generated JSON and Swagger UI
- the frontend uses the same contract package for typed client calls
- docs and runtime schemas stay closer together than a hand-maintained Swagger file

## Current Contract Modules

- [health.ts](./src/contracts/health.ts)
- [claim.ts](./src/contracts/claim.ts)
- [audit.ts](./src/contracts/audit.ts)
- [policy.ts](./src/contracts/policy.ts)
- [organization.ts](./src/contracts/organization.ts)

## Recommended Future Work

- add contract coverage for remaining binary and download routes where it makes sense
- keep improving summaries and descriptions so generated docs become more onboarding-friendly
- extend contracts alongside future analytics, export, and notification-center work

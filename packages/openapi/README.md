# @auditor/openapi

`@auditor/openapi` is the contract-generation package for the monorepo. It turns ts-rest route contracts into OpenAPI JSON and keeps a generated copy in the backend so `/docs` can serve the latest API spec.

## Responsibilities

- define API contracts in code
- generate OpenAPI JSON from those contracts
- copy generated docs into the backend static folder

## Inputs And Outputs

### Inputs

- contract files under `src/contracts`
- schemas from `@auditor/zod`

### Outputs

- `packages/openapi/openapi.json`
- `apps/backend/static/openapi.json`

The generation logic lives in [src/gen.ts](./src/gen.ts).

## Current Coverage

The package currently generates contracts centered on:

- health routes
- claim routes
- admin claim review routes

That means OpenAPI coverage is useful today, but not yet complete for every backend endpoint. Policy, organization, and some audit-related routes can still be expanded here.

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

- backend serves the generated JSON and Swagger UI
- frontend can rely on the same contract package for typed client work
- docs and runtime schemas stay closer together than a hand-maintained Swagger file

## Recommended Future Work

- add policy route contracts
- add organization and invitation route contracts
- add audit response contracts
- expand description metadata so generated docs become more onboarding-friendly

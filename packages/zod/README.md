# @auditor/zod

`@auditor/zod` is the shared schema package for the monorepo. It defines the canonical Zod models and the derived TypeScript types used by the frontend and the OpenAPI contract layer.

## Why This Package Exists

This package keeps the frontend and contract generation layer aligned on:

- claim status enums
- request query shapes
- response payload shapes
- shared domain concepts such as policy, audit, and health data

Without this package, the frontend and API contracts would drift over time.

## Current Exports

The package currently exports schemas from:

- `health.ts`
- `claim.ts`
- `policy.ts`
- `audit.ts`
- `utils.ts`

The main entrypoint is [src/index.ts](./src/index.ts).

## Build And Development

```bash
cd C:\dev\Projects\expense-auditor\packages\zod
bun run build
```

Watch mode:

```bash
bun run dev
```

Clean build artifacts:

```bash
bun run clean
```

## How It Fits Into The Monorepo

- `apps/frontend` imports runtime-safe types and schemas from this package.
- `packages/openapi` imports these schemas to build the API contract and generated OpenAPI JSON.

## Example: Claim Models

The claim schema currently includes:

- claim status enum
- expense category enum
- submit-claim response shape
- admin claim filter query shape
- claim response model

That makes this package the source of truth for admin queue filter options and claim lifecycle states.

## When To Update This Package

Update `@auditor/zod` when:

- a response payload changes
- a new claim status is added
- an admin filter gains a new query option
- audit or policy payloads change shape

## Recommended Change Workflow

1. Update the relevant schema file in `src/`.
2. Re-export from `src/index.ts` if needed.
3. Run `bun run build`.
4. Rebuild `packages/openapi`.
5. Regenerate OpenAPI JSON if contract output changes.
6. Update frontend consumers.

## Current Scope

This package already covers the core shared domain objects for:

- claims
- policies
- audits
- health

It does not replace backend validation by itself. Backend handler and service validation still remain the enforcement layer.

## Future Improvements

- add more explicit request schemas for policy and organization routes
- add schema-level metadata comments for clearer generated docs
- expand shared types around reviewer overrides and dispute flows once those features ship

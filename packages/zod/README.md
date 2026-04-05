# @auditor/zod

`@auditor/zod` is the shared schema package for the monorepo. It defines the canonical Zod models and derived TypeScript types used by the frontend and the contract-generation layer.

## Why This Package Exists

This package keeps the frontend and the OpenAPI contract layer aligned on:

- claim lifecycle states
- request and response payloads
- admin review shapes
- policy models
- audit history and override models
- organization invitation and role-management payloads

Without this package, the UI and the contract layer would drift over time.

## Current Exports

The package currently exports schemas from:

- `utils.ts`
- `health.ts`
- `claim.ts`
- `policy.ts`
- `audit.ts`
- `organization.ts`

The main entrypoint is [src/index.ts](./src/index.ts).

## Current Scope

The package currently covers shared domain objects for:

- health responses
- claim status, categories, list/detail payloads, and admin claim queries
- admin claim detail responses including policy chunks and audit history
- reviewer override request payloads
- policy list and active-policy payloads
- audit responses including human override metadata
- organization invitations and member role update payloads

It does not replace backend validation by itself. Backend handler and service validation remain the enforcement layer.

## Build And Development

```bash
cd C:\dev\Projects\expense-auditor\packages\zod
bun run build
```

Watch mode:

```bash
bun run dev
```

Clean artifacts:

```bash
bun run clean
```

## How It Fits Into The Monorepo

- `apps/frontend` imports runtime-safe types and schemas from this package.
- `packages/openapi` imports these schemas to build the ts-rest contract and generated OpenAPI JSON.

## Example Areas Covered Today

### Claims

- `ZClaimStatus`
- `ZExpenseCategory`
- `ZSubmitClaimResponse`
- `ZClaimResponse`
- `ZAdminClaimListQuery`
- `ZAdminClaimDetailResponse`

### Audit

- `ZAuditDecisionStatus`
- `ZAuditResponse`
- `ZAdminClaimOverrideRequest`

### Organization

- `ZOrganizationRole`
- `ZCreateOrganizationInvitationRequest`
- `ZCreateOrganizationInvitationResponse`
- `ZUpdateOrganizationMembershipRoleRequest`
- `ZUpdateOrganizationMembershipRoleResponse`

## When To Update This Package

Update `@auditor/zod` when:

- a response payload changes
- a new claim status is added
- admin review data changes shape
- a new organization or policy payload is shared across apps
- a contract needs a reusable request schema

## Recommended Change Workflow

1. Update the relevant schema file in `src/`.
2. Re-export from `src/index.ts` if needed.
3. Run `bun run build`.
4. Rebuild `packages/openapi`.
5. Regenerate OpenAPI JSON if contract output changes.
6. Update frontend consumers.

## Future Improvements

- add richer schema metadata for better generated API descriptions
- add more explicit non-JSON route helpers where downloads or multipart flows need clearer shared typing
- keep expanding policy and notification-related shared payloads as those features grow

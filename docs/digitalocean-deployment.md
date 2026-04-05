# DigitalOcean Droplet + Dokploy Deployment Guide

Validated for this repository on 2026-04-05.

This runbook documents the current production path for Expense Auditor:

1. provision a DigitalOcean droplet with Terraform from `packages/infra`
2. install Dokploy on that droplet
3. run PostgreSQL + pgvector and Redis as a Dokploy compose stack
4. deploy the frontend and backend as separate Dokploy applications

This guide is intentionally repo-specific. It reflects the current monorepo layout, current Nixpacks setup, and the app's current environment/config expectations.

## 1. Repo-specific deployment facts

These details shape the deployment plan:

- the frontend lives in `apps/frontend`, but its Nixpacks build depends on the monorepo root and shared packages
- the frontend Nixpacks config lives at the repo root in [nixpacks.toml](../nixpacks.toml)
- the backend is a Go service in `apps/backend` with its own [apps/backend/nixpacks.toml](../apps/backend/nixpacks.toml)
- the frontend serves its production build on port `3000`
- the backend listens on `EXPAU_SERVER.PORT` and exposes health on `GET /status`
- the frontend reads `VITE_*` values at build time, not runtime
- the backend runs migrations on startup
- the backend requires PostgreSQL with the `vector` extension
- the backend requires Google Cloud Storage credentials for receipt and policy uploads
- the backend currently expects Redis as a plain `host:port` value via `EXPAU_REDIS.ADDRESS`

Practical implications:

- rebuild the frontend whenever `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, or `VITE_ENV` changes
- start with one backend instance because migrations run during startup
- keep Redis private on the Dokploy network
- set `EXPAU_SERVER.CORS_ALLOWED_ORIGINS` to the frontend origin such as `https://app.example.com`

## 2. Recommended domains

Use three hostnames:

- `dokploy.example.com` for the Dokploy panel
- `app.example.com` for the frontend
- `api.example.com` for the backend

## 3. Required secrets and external services

You need these before production is useful:

- Clerk publishable key for the frontend
- Clerk secret key for the backend
- Gemini API key
- Resend API key
- Resend sender address
- Google Cloud Storage bucket
- GCP service account JSON file with access to that bucket

For stateful services:

- PostgreSQL with `CREATE EXTENSION vector;`
- Redis reachable from the backend on the private Dokploy network

## 4. Provision the droplet

Use the Terraform workspace in [packages/infra](../packages/infra/README.md).

Example:

```bash
cd C:\dev\Projects\expense-auditor\packages\infra
terraform init
terraform plan
terraform apply
terraform output droplet_ip
```

Recommended production baseline for a single-host Dokploy setup:

- Ubuntu LTS
- at least `s-2vcpu-4gb`

The current Terraform defaults are intentionally minimal. Adjust the size upward before real production OCR/audit traffic.

## 5. Install Dokploy

SSH into the droplet, then follow the official Dokploy install instructions.

At the time this doc was validated, the standard install looked like:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

After install:

1. open `http://<droplet-ip>:3000`
2. create the Dokploy admin account
3. attach the panel to `dokploy.example.com`
4. enable HTTPS on the panel

After the panel is on a real hostname, stop using direct `IP:3000` access.

## 6. Create DNS records

Point these `A` records to the droplet public IP:

- `dokploy.example.com`
- `app.example.com`
- `api.example.com`

If you use Cloudflare, use proxied records and set SSL mode to `Full (Strict)`.

## 7. Create the Dokploy data stack

Create a Dokploy Docker Compose service named something like `expense-auditor-data` and use a private shared network only.

Example compose file:

```yaml
version: "3.8"

services:
  expenseauditor-postgres:
    image: pgvector/pgvector:pg15
    restart: unless-stopped
    environment:
      POSTGRES_DB: auditor
      POSTGRES_USER: auditor
      POSTGRES_PASSWORD: change-me
    volumes:
      - expenseauditor-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U auditor -d auditor"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - dokploy-network

  expenseauditor-redis:
    image: redis:7
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - expenseauditor-redis-data:/data
    networks:
      - dokploy-network

volumes:
  expenseauditor-postgres-data: {}
  expenseauditor-redis-data: {}

networks:
  dokploy-network:
    external: true
```

Important:

- do not publish Postgres or Redis ports publicly
- the `pgvector/pgvector` image already includes the `vector` extension

## 8. Create the frontend application

Create a Dokploy Application with:

- Source: this Git repository
- Branch: your production branch
- Build type: `Nixpacks`
- Build path: repository root `/`
- Internal port: `3000`
- Domain: `app.example.com`

Required build-time environment values:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
VITE_API_URL=https://api.example.com
VITE_ENV=production
```

Notes:

- the frontend build uses the repo-root [nixpacks.toml](../nixpacks.toml)
- any `VITE_*` change requires a rebuild and redeploy

## 9. Create the backend application

Create another Dokploy Application with:

- Source: the same Git repository
- Branch: your production branch
- Build type: `Nixpacks`
- Build path: `/apps/backend`
- Internal port: `8080`
- Domain: `api.example.com`

Required runtime environment values:

```dotenv
EXPAU_PRIMARY.ENV=production

EXPAU_SERVER.PORT=8080
EXPAU_SERVER.READ_TIMEOUT=30
EXPAU_SERVER.WRITE_TIMEOUT=30
EXPAU_SERVER.IDLE_TIMEOUT=60
EXPAU_SERVER.CORS_ALLOWED_ORIGINS=https://app.example.com

EXPAU_DATABASE.HOST=expenseauditor-postgres
EXPAU_DATABASE.PORT=5432
EXPAU_DATABASE.USER=auditor
EXPAU_DATABASE.PASSWORD=change-me
EXPAU_DATABASE.NAME=auditor
EXPAU_DATABASE.SSL_MODE=disable
EXPAU_DATABASE.MAX_OPEN_CONNS=20
EXPAU_DATABASE.MAX_IDLE_CONNS=10
EXPAU_DATABASE.CONN_MAX_LIFETIME=30m
EXPAU_DATABASE.CONN_MAX_IDLE_TIME=5m

EXPAU_REDIS.ADDRESS=expenseauditor-redis:6379

EXPAU_AUTH.SECRET_KEY=sk_live_xxx

EXPAU_INTEGRATION.RESEND_API_KEY=re_xxx
EXPAU_INTEGRATION.RESEND_FROM=Expense Auditor <onboarding@your-domain.com>

EXPAU_AI.GEMINI_API_KEY=gm_xxx
EXPAU_AI.DATE_MISMATCH_THRESHOLD=7

EXPAU_STORAGE.GCS_BUCKET_NAME=your-bucket
EXPAU_STORAGE.GCS_PROJECT_ID=your-project
EXPAU_STORAGE.GCS_CREDENTIALS=/app/secrets/service-account.json
EXPAU_STORAGE.MAX_FILE_SIZE_MB=10
```

Mount the GCP service account JSON file into the backend container at:

```text
/app/secrets/service-account.json
```

Then keep:

```dotenv
EXPAU_STORAGE.GCS_CREDENTIALS=/app/secrets/service-account.json
```

## 10. TLS and domains in Dokploy

For each app domain:

1. open the app in Dokploy
2. go to `Domains`
3. add the domain
4. enable HTTPS

Recommended setup:

- Cloudflare proxied DNS
- Cloudflare SSL mode `Full (Strict)`
- Dokploy-managed HTTPS or a Cloudflare Origin CA certificate for origin traffic

## 11. Validation checklist

Before calling the deployment healthy, verify:

- `https://app.example.com`
- `https://api.example.com/status`
- Clerk sign-in and invitation acceptance
- org creation and org switching
- policy upload
- claim submission
- OCR and audit pipeline
- admin review queue
- reviewer override flow
- employee outcome emails

## 12. Operational notes

Current repo constraints worth knowing:

- Redis is configured as plain `host:port`, so managed TLS/auth Redis is not plug-and-play yet
- frontend `VITE_*` values are baked at build time
- backend startup includes migrations, so keep the first production rollout to one backend instance
- this repo currently contains local Terraform state files in `packages/infra`; move to remote state for any shared production workflow

## 13. Recommended path forward

For this repo today, the lowest-friction production path is:

1. start with the Dokploy-on-droplet deployment above
2. validate auth, uploads, OCR, policy ingestion, audit, overrides, and email
3. harden monitoring, backups, and secrets handling
4. move to a more distributed platform later if you outgrow the single-host setup

## 14. Source links

- Dokploy installation: <https://docs.dokploy.com/docs/core/installation>
- Dokploy applications: <https://docs.dokploy.com/docs/core/applications>
- Dokploy build type: <https://docs.dokploy.com/docs/core/applications/build-type>
- Dokploy Docker Compose: <https://docs.dokploy.com/docs/core/docker-compose>
- Dokploy domains and Cloudflare: <https://docs.dokploy.com/docs/core/domains/cloudflare>
- DigitalOcean Droplets docs: <https://docs.digitalocean.com/products/droplets/>
- Cloudflare Full (Strict): <https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/>

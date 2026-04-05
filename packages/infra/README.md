# packages/infra

This package holds the minimal Terraform workspace used to provision the DigitalOcean droplet that hosts Dokploy for the current production deployment path.

It is intentionally small: today it provisions a single droplet. Dokploy installation, panel setup, Docker workloads, PostgreSQL, Redis, domains, and application deployment happen after Terraform apply.

## What This Terraform Workspace Provisions

- one DigitalOcean droplet
- configurable region, size, image, SSH keys, and tags
- the droplet public IPv4 output

Current Terraform files:

- [provider.tf](./provider.tf)
- [variables.tf](./variables.tf)
- [droplet.tf](./droplet.tf)
- [output.tf](./output.tf)

## Prerequisites

- Terraform `1.6+`
- a DigitalOcean API token
- at least one SSH key already registered in DigitalOcean
- a domain you can point to the droplet later

## Variables

Key inputs from [variables.tf](./variables.tf):

- `do_token`
- `droplet_name`
- `region`
- `image`
- `size`
- `ssh_keys`
- `tags`

The current defaults are tuned for a minimal Ubuntu droplet:

- image: `ubuntu-22-04-x64`
- region: `blr1`
- size: `s-1vcpu-1gb`

For Dokploy plus PostgreSQL, Redis, frontend, and backend on one host, a larger droplet is usually the better starting point in production. A practical baseline is `s-2vcpu-4gb` if you expect real OCR/audit usage.

## Example terraform.tfvars

```hcl
do_token     = "dop_v1_xxx"
droplet_name = "expense-auditor-prod"
region       = "blr1"
image        = "ubuntu-22-04-x64"
size         = "s-2vcpu-4gb"
ssh_keys     = ["12345678"]
tags         = ["expense-auditor", "dokploy", "production"]
```

## Provision The Droplet

From `packages/infra`:

```bash
cd C:\dev\Projects\expense-auditor\packages\infra
terraform init
terraform plan
terraform apply
```

Get the public IP:

```bash
terraform output droplet_ip
```

## Recommended Next Step: Install Dokploy

After Terraform finishes:

1. SSH into the droplet.
2. Follow the official Dokploy installation steps.
3. Open the Dokploy panel on port `3000`.
4. Assign a proper panel domain and enable HTTPS.

The current repo deployment path expects:

- `dokploy.example.com` for the Dokploy panel
- `app.example.com` for the frontend
- `api.example.com` for the backend

## Deploy Expense Auditor With Dokploy

### 1. Create a shared data stack

Create a Dokploy compose service for:

- PostgreSQL with pgvector
- Redis

Recommended service names:

- `expenseauditor-postgres`
- `expenseauditor-redis`

Keep both on the shared Dokploy network and do not expose them publicly.

### 2. Create the frontend application

Use these Dokploy settings:

- Source: this Git repository
- Build type: `Nixpacks`
- Build path: repository root `/`
- Internal port: `3000`
- Domain: `app.example.com`

Required build-time environment variables:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
VITE_API_URL=https://api.example.com
VITE_ENV=production
```

Important:

- the frontend build depends on the root [nixpacks.toml](../../nixpacks.toml)
- changing `VITE_*` values requires a rebuild

### 3. Create the backend application

Use these Dokploy settings:

- Source: this Git repository
- Build type: `Nixpacks`
- Build path: `/apps/backend`
- Internal port: `8080`
- Domain: `api.example.com`

Required runtime environment variables:

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

Mount your GCP service account JSON file into the backend container at:

```text
/app/secrets/service-account.json
```

### 4. Validate

Check:

- `https://app.example.com`
- `https://api.example.com/status`
- Clerk sign-in and invitation acceptance
- claim submission
- OCR and audit pipeline
- outcome emails

## Current Deployment Constraints

These are worth knowing before you promote this workspace into a shared production baseline:

- the backend currently expects Redis as a plain `host:port` address
- frontend `VITE_*` values are build-time only
- backend startup runs migrations, so start with one backend instance
- this Terraform workspace currently uses local state files

For a shared production setup, move to remote Terraform state and make sure `terraform.tfvars`, `terraform.tfstate`, and secret material are not committed.

## Recommended References

- [Root README](../../README.md)
- [DigitalOcean + Dokploy Deployment Guide](../../docs/digitalocean-deployment.md)

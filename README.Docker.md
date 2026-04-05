# Docker Notes

This repository does not use a single root `docker compose` application for the whole monorepo.

## Local Docker Usage

For local development, Docker is primarily used to run the backend data dependencies from [apps/backend/compose.yaml](./apps/backend/compose.yaml):

```bash
cd C:\dev\Projects\expense-auditor\apps\backend
docker compose up -d
```

That starts:

- PostgreSQL with pgvector on `localhost:15432`
- Redis on `localhost:16316`

## Production Container Story

The current production deployment path documented in this repo is:

- a DigitalOcean droplet provisioned from `packages/infra`
- Dokploy installed on that droplet
- separate Dokploy applications for:
  - the frontend
  - the backend
- a Dokploy compose stack for PostgreSQL and Redis

## Build Inputs Used By Dokploy

### Frontend

- build path: repository root
- config: [nixpacks.toml](./nixpacks.toml)
- runtime app: `apps/frontend`

### Backend

- build path: `apps/backend`
- config: [apps/backend/nixpacks.toml](./apps/backend/nixpacks.toml)
- optional manual Docker build path: [apps/backend/Dockerfile](./apps/backend/Dockerfile)

## Recommended References

- [Root README](./README.md)
- [Infra README](./packages/infra/README.md)
- [DigitalOcean + Dokploy Deployment Guide](./docs/digitalocean-deployment.md)

# Expense Auditor Deployment Guide

Validated for this repository on 2026-04-04.

This runbook covers two production deployment paths for this repo:

1. DigitalOcean Kubernetes (DOKS) + DigitalOcean Container Registry + Cloudflare DNS/TLS
2. DigitalOcean VPS + Dokploy + Cloudflare DNS/TLS

It is written for the current codebase, not as a generic guide.

One platform note: this repo already has Nixpacks configs and Dokploy supports Nixpacks, so this guide sticks with that. Upstream Nixpacks is in maintenance mode, so treat it as "use now, reassess later" rather than a forever choice.

## 1. Repo-specific deployment facts

These details shape the deployment plan:

- The frontend is a Bun/Vite app in `apps/frontend`, but its Nixpacks build depends on the monorepo root and shared packages.
- The frontend Nixpacks config lives at the repo root in `nixpacks.toml`.
- The backend is a Go service in `apps/backend` with its own `apps/backend/nixpacks.toml`.
- The frontend serves static assets on port `3000`.
- The backend listens on `EXPAU_SERVER.PORT` and exposes health on `GET /status`.
- The frontend reads `VITE_*` variables at build time, not runtime.
- The backend auto-runs DB migrations on startup.
- The backend needs PostgreSQL with the `vector` extension.
- The backend expects `EXPAU_STORAGE.GCS_CREDENTIALS` to be a file path to a GCP service account JSON file.
- The backend currently only supports Redis as a plain host:port value via `EXPAU_REDIS.ADDRESS`.

Current practical implications:

- Rebuild the frontend image whenever `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, or `VITE_ENV` changes.
- Keep backend replicas at `1` for the first production rollout, because migrations run during startup.
- Use a Redis instance on a private network without TLS/auth unless you first extend the backend config.
- Set `EXPAU_SERVER.CORS_ALLOWED_ORIGINS` to a single frontend origin such as `https://app.example.com`. The current config loader does not parse multi-origin env values correctly.

## 2. Recommended domains

Use three hostnames:

- `app.example.com` for the frontend
- `api.example.com` for the backend
- `dokploy.example.com` for the Dokploy panel if you choose the VPS path

## 3. Required secrets and external services

You need these before either deployment path is useful:

- Clerk publishable key for the frontend
- Clerk secret key for the backend
- Gemini API key
- Resend API key
- Google Cloud Storage bucket
- GCP service account JSON file with access to that bucket

For production storage and state:

- PostgreSQL with `CREATE EXTENSION vector;`
- Redis reachable from the backend on a private network

## 4. Shared environment values

### Frontend

Build-time variables:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
VITE_API_URL=https://api.example.com
VITE_ENV=production
```

### Backend

Runtime variables:

```dotenv
EXPAU_PRIMARY.ENV=production

EXPAU_SERVER.PORT=8080
EXPAU_SERVER.READ_TIMEOUT=30
EXPAU_SERVER.WRITE_TIMEOUT=30
EXPAU_SERVER.IDLE_TIMEOUT=60
EXPAU_SERVER.CORS_ALLOWED_ORIGINS=https://app.example.com

EXPAU_DATABASE.HOST=<postgres-host>
EXPAU_DATABASE.PORT=<postgres-port>
EXPAU_DATABASE.USER=<postgres-user>
EXPAU_DATABASE.PASSWORD=<postgres-password>
EXPAU_DATABASE.NAME=<postgres-db>
EXPAU_DATABASE.SSL_MODE=require
EXPAU_DATABASE.MAX_OPEN_CONNS=20
EXPAU_DATABASE.MAX_IDLE_CONNS=10
EXPAU_DATABASE.CONN_MAX_LIFETIME=30m
EXPAU_DATABASE.CONN_MAX_IDLE_TIME=5m

EXPAU_REDIS.ADDRESS=<redis-host>:6379

EXPAU_AUTH.SECRET_KEY=sk_live_xxx
EXPAU_INTEGRATION.RESEND_API_KEY=re_xxx

EXPAU_AI.GEMINI_API_KEY=gm_xxx
EXPAU_AI.DATE_MISMATCH_THRESHOLD=7

EXPAU_STORAGE.GCS_BUCKET_NAME=<bucket-name>
EXPAU_STORAGE.GCS_PROJECT_ID=<gcp-project-id>
EXPAU_STORAGE.GCS_CREDENTIALS=/var/run/secrets/gcp/service-account.json
EXPAU_STORAGE.MAX_FILE_SIZE_MB=10
```

Optional observability values:

```dotenv
EXPAU_OBSERVABILITY.LOGGING.LEVEL=info
EXPAU_OBSERVABILITY.LOGGING.FORMAT=json
EXPAU_OBSERVABILITY.NEW_RELIC.LICENSE_KEY=
```

## 5. Path A: DigitalOcean Kubernetes

This is the better choice if you want HA, rolling deploys, and clean separation between app and platform.

### 5.1 Architecture

- Frontend image built by Nixpacks from repo root
- Backend image built by Nixpacks from `apps/backend`
- Images stored in DigitalOcean Container Registry
- Frontend and backend deployed to DOKS
- Cloudflare handles DNS and edge proxying
- TLS handled in-cluster with ingress-nginx + cert-manager + Cloudflare DNS-01
- PostgreSQL should be managed DigitalOcean PostgreSQL
- Redis should be an in-cluster Deployment for now because the backend does not yet support managed Valkey/Redis auth/TLS settings

### 5.2 Provision DigitalOcean resources

Create:

- a DigitalOcean project
- a DigitalOcean Container Registry
- a DOKS cluster
- a managed PostgreSQL cluster

After creating PostgreSQL:

1. Add the DOKS cluster or its worker nodes as trusted sources in DigitalOcean.
2. Connect once and run:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 5.3 Build and push images with Nixpacks

Login first:

```bash
doctl auth init
doctl registry login
```

Build tags using the current git SHA:

```powershell
$SHA = (git rev-parse --short HEAD).Trim()
```

Build and push the frontend image from the repo root:

```powershell
nixpacks build . `
  --config ./nixpacks.toml `
  --name expense-auditor-frontend `
  --tag registry.digitalocean.com/<registry>/expense-auditor-frontend:$SHA `
  --env VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx `
  --env VITE_API_URL=https://api.example.com `
  --env VITE_ENV=production

docker push registry.digitalocean.com/<registry>/expense-auditor-frontend:$SHA
```

Build and push the backend image:

```powershell
nixpacks build ./apps/backend `
  --config ./apps/backend/nixpacks.toml `
  --name expense-auditor-backend `
  --tag registry.digitalocean.com/<registry>/expense-auditor-backend:$SHA

docker push registry.digitalocean.com/<registry>/expense-auditor-backend:$SHA
```

### 5.4 Create the DOKS cluster

Example:

```bash
doctl kubernetes cluster create expense-auditor-prod \
  --region <region> \
  --version latest \
  --node-pool "name=app;size=s-2vcpu-4gb;count=2;auto-scale=true;min-nodes=2;max-nodes=4"
```

Then pull kubeconfig:

```bash
doctl kubernetes cluster kubeconfig save expense-auditor-prod
```

### 5.5 Install ingress-nginx

Use the provider manifest for DigitalOcean:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/do/deploy.yaml
```

Wait until the ingress controller `Service` gets an external IP.

### 5.6 Install cert-manager

Example from the current cert-manager Helm docs:

```bash
helm install cert-manager oci://quay.io/jetstack/charts/cert-manager \
  --version v1.20.0 \
  --namespace cert-manager \
  --create-namespace \
  --set crds.enabled=true
```

### 5.7 Integrate DigitalOcean Container Registry with the cluster

Recommended path:

- open the Container Registry page in the DigitalOcean control panel
- add Kubernetes integration for your DOKS cluster

CLI fallback:

```bash
doctl registries kubernetes-manifest <registry-name> --namespace=expense-auditor | kubectl apply -f -
```

### 5.8 Create namespace and secrets

Create the namespace:

```bash
kubectl create namespace expense-auditor
```

Create the GCS credential file secret:

```bash
kubectl -n expense-auditor create secret generic gcs-service-account \
  --from-file=service-account.json=./service-account.json
```

Create the backend secret values:

```bash
kubectl -n expense-auditor create secret generic backend-secrets \
  --from-literal=EXPAU_DATABASE.USER='<postgres-user>' \
  --from-literal=EXPAU_DATABASE.PASSWORD='<postgres-password>' \
  --from-literal=EXPAU_AUTH.SECRET_KEY='<clerk-secret-key>' \
  --from-literal=EXPAU_INTEGRATION.RESEND_API_KEY='<resend-api-key>' \
  --from-literal=EXPAU_AI.GEMINI_API_KEY='<gemini-api-key>'
```

Create the Cloudflare API token secret for cert-manager:

```bash
kubectl -n cert-manager create secret generic cloudflare-api-token-secret \
  --from-literal=api-token='<cloudflare-api-token>'
```

That Cloudflare token should have:

- `Zone - DNS - Edit`
- `Zone - Zone - Read`

### 5.9 Apply the Kubernetes manifests

Save the following as `deploy/k8s/expense-auditor.yaml` locally and apply it. Adjust hostnames, image tags, and database coordinates first.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: frontend-config
  namespace: expense-auditor
data:
  PORT: "3000"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: backend-config
  namespace: expense-auditor
data:
  EXPAU_PRIMARY.ENV: "production"
  EXPAU_SERVER.PORT: "8080"
  EXPAU_SERVER.READ_TIMEOUT: "30"
  EXPAU_SERVER.WRITE_TIMEOUT: "30"
  EXPAU_SERVER.IDLE_TIMEOUT: "60"
  EXPAU_SERVER.CORS_ALLOWED_ORIGINS: "https://app.example.com"
  EXPAU_DATABASE.HOST: "<postgres-host>"
  EXPAU_DATABASE.PORT: "<postgres-port>"
  EXPAU_DATABASE.NAME: "<postgres-db>"
  EXPAU_DATABASE.SSL_MODE: "require"
  EXPAU_DATABASE.MAX_OPEN_CONNS: "20"
  EXPAU_DATABASE.MAX_IDLE_CONNS: "10"
  EXPAU_DATABASE.CONN_MAX_LIFETIME: "30m"
  EXPAU_DATABASE.CONN_MAX_IDLE_TIME: "5m"
  EXPAU_REDIS.ADDRESS: "redis.expense-auditor.svc.cluster.local:6379"
  EXPAU_AI.DATE_MISMATCH_THRESHOLD: "7"
  EXPAU_STORAGE.GCS_BUCKET_NAME: "<bucket-name>"
  EXPAU_STORAGE.GCS_PROJECT_ID: "<gcp-project-id>"
  EXPAU_STORAGE.GCS_CREDENTIALS: "/var/run/secrets/gcp/service-account.json"
  EXPAU_STORAGE.MAX_FILE_SIZE_MB: "10"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: expense-auditor
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7
          ports:
            - containerPort: 6379
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: expense-auditor
spec:
  selector:
    app: redis
  ports:
    - port: 6379
      targetPort: 6379
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: expense-auditor
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      imagePullSecrets:
        - name: registry-<registry>
      containers:
        - name: backend
          image: registry.digitalocean.com/<registry>/expense-auditor-backend:<tag>
          ports:
            - containerPort: 8080
          envFrom:
            - configMapRef:
                name: backend-config
            - secretRef:
                name: backend-secrets
          volumeMounts:
            - name: gcs-service-account
              mountPath: /var/run/secrets/gcp
              readOnly: true
          readinessProbe:
            httpGet:
              path: /status
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /status
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 20
      volumes:
        - name: gcs-service-account
          secret:
            secretName: gcs-service-account
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: expense-auditor
spec:
  selector:
    app: backend
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: expense-auditor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      imagePullSecrets:
        - name: registry-<registry>
      containers:
        - name: frontend
          image: registry.digitalocean.com/<registry>/expense-auditor-frontend:<tag>
          ports:
            - containerPort: 3000
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 20
            periodSeconds: 20
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: expense-auditor
spec:
  selector:
    app: frontend
  ports:
    - port: 3000
      targetPort: 3000
---
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-cloudflare
spec:
  acme:
    email: ops@example.com
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-cloudflare
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-api-token-secret
              key: api-token
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: expense-auditor
  namespace: expense-auditor
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-cloudflare
    nginx.ingress.kubernetes.io/proxy-body-size: "20m"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
        - api.example.com
      secretName: expense-auditor-tls
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 3000
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: backend
                port:
                  number: 8080
```

Apply it:

```bash
kubectl apply -f deploy/k8s/expense-auditor.yaml
```

### 5.10 Add Cloudflare DNS records

After the ingress controller receives a public IP:

1. Create proxied `A` record `app` -> ingress public IP
2. Create proxied `A` record `api` -> ingress public IP

### 5.11 Validate the deployment

Check:

```bash
kubectl -n expense-auditor get pods
kubectl -n expense-auditor get ingress
kubectl -n expense-auditor logs deploy/backend --tail=100
```

Then verify:

- `https://app.example.com`
- `https://api.example.com/status`
- login flow through Clerk
- claim upload flow
- GCS upload
- OCR and audit pipeline

## 6. Path B: DigitalOcean VPS + Dokploy

This is the simpler path if you want one VPS, one control panel, and faster iteration.

### 6.1 Architecture

- Dokploy runs on a DigitalOcean VPS
- Frontend is a Dokploy Application built with Nixpacks from the repo root
- Backend is a Dokploy Application built with Nixpacks from `apps/backend`
- PostgreSQL and Redis run as a small Dokploy Docker Compose data stack on the shared Dokploy network
- Cloudflare handles DNS and proxies traffic
- TLS is terminated by Dokploy/Traefik with either Let's Encrypt or Cloudflare Origin CA

### 6.2 Provision the VPS

Use Ubuntu LTS on a fresh VPS. Make sure ports `80`, `443`, and `3000` are free before installing Dokploy.

Install Dokploy:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

Then open:

```text
http://<your-vps-ip>:3000
```

Create the initial Dokploy admin account.

### 6.3 Add Cloudflare records

Create proxied `A` records:

- `dokploy.example.com` -> VPS public IP
- `app.example.com` -> VPS public IP
- `api.example.com` -> VPS public IP

Set Cloudflare SSL/TLS mode to `Full (Strict)`.

### 6.4 Secure the Dokploy panel

In Dokploy:

1. assign `dokploy.example.com` to the panel
2. enable HTTPS
3. use either `Let's Encrypt` or a Cloudflare Origin CA certificate

After that works, disable direct `IP:3000` panel access.

### 6.5 Create the Dokploy data stack

Create a Dokploy Docker Compose service named `expense-auditor-data` and use this compose file:

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

Notes:

- This keeps both services private on the Dokploy shared network.
- Do not expose database or Redis ports publicly.
- The Postgres image already includes the `vector` extension.

### 6.6 Create the frontend application in Dokploy

Create a Dokploy Application with:

- Source: your Git repo
- Branch: your production branch
- Build Type: `Nixpacks`
- Build Path: `/`
- Internal Port: `3000`
- Domain: `app.example.com`

Environment values:

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
VITE_API_URL=https://api.example.com
VITE_ENV=production
```

Important:

- Set those vars before the first build.
- Any change to `VITE_*` requires a rebuild and redeploy.

### 6.7 Create the backend application in Dokploy

Create another Dokploy Application with:

- Source: same Git repo
- Branch: your production branch
- Build Type: `Nixpacks`
- Build Path: `/apps/backend`
- Internal Port: `8080`
- Domain: `api.example.com`

Environment values:

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
EXPAU_AI.GEMINI_API_KEY=gm_xxx
EXPAU_AI.DATE_MISMATCH_THRESHOLD=7

EXPAU_STORAGE.GCS_BUCKET_NAME=<bucket-name>
EXPAU_STORAGE.GCS_PROJECT_ID=<gcp-project-id>
EXPAU_STORAGE.GCS_CREDENTIALS=/app/secrets/service-account.json
EXPAU_STORAGE.MAX_FILE_SIZE_MB=10
```

### 6.8 Mount the GCS credential file in Dokploy

For the backend app, add a file mount in Dokploy:

- mount path inside container: `/app/secrets/service-account.json`
- source: your GCP service account JSON file

Then keep:

```dotenv
EXPAU_STORAGE.GCS_CREDENTIALS=/app/secrets/service-account.json
```

### 6.9 Configure TLS for the frontend and backend in Dokploy

For each app domain:

1. open the app in Dokploy
2. go to `Domains`
3. create the domain
4. enable `HTTPS`
5. choose `Let's Encrypt` or use a Cloudflare Origin CA cert

Recommended choice:

- `Let's Encrypt` if you want standard public certs managed by Dokploy
- `Cloudflare Origin CA` if you want Cloudflare-only origin certs with long validity

### 6.10 Validate the VPS deployment

Check:

- `https://dokploy.example.com`
- `https://app.example.com`
- `https://api.example.com/status`
- backend logs in Dokploy
- database and Redis health
- Clerk auth
- claim upload and audit flow

## 7. Cloudflare TLS guidance

Use Cloudflare proxied records for public app traffic.

Recommended mode:

- `Full (Strict)`

Why:

- traffic from browser to Cloudflare is encrypted
- traffic from Cloudflare to your origin is also encrypted
- Cloudflare validates the origin certificate

Use `Flexible` only for short-lived emergency workarounds. Do not use it for steady-state production.

## 8. Recommended choice

Choose DigitalOcean Kubernetes if:

- you want HA
- you want clearer separation of app and infra
- you are comfortable with Kubernetes operations
- you want better long-term scaling

Choose DigitalOcean VPS + Dokploy if:

- you want the fastest path to a working production deployment
- you are okay with lower operational isolation
- you want a simpler control plane

For this repo today, the most friction-free order is:

1. deploy with Dokploy first
2. harden and validate auth, uploads, OCR, audit, and GCS
3. move to DOKS when you want HA and cleaner platform boundaries

## 9. Known limitations in the current codebase

These are the main repo constraints to keep in mind:

- Redis config is currently just `EXPAU_REDIS.ADDRESS`, so managed Redis/Valkey products that require auth or TLS are not plug-and-play yet.
- `EXPAU_SERVER.CORS_ALLOWED_ORIGINS` should be treated as a single origin value for now.
- The frontend requires rebuilds for `VITE_*` changes.
- Backend startup currently includes migrations, so avoid scaling backend replicas aggressively before your first stable rollout.

## 10. Source links

- Nixpacks introduction: <https://nixpacks.com/docs>
- Nixpacks CLI: <https://nixpacks.com/docs/cli>
- Nixpacks config file reference: <https://nixpacks.com/docs/configuration/file>
- Nixpacks Dokploy page: <https://nixpacks.com/docs/deploying/dokploy>
- DigitalOcean Kubernetes cluster creation: <https://docs.digitalocean.com/products/kubernetes/how-to/create-clusters/>
- DigitalOcean Container Registry with Kubernetes: <https://docs.digitalocean.com/products/container-registry/how-to/use-registry-docker-kubernetes/>
- DigitalOcean pgvector note: <https://docs.digitalocean.com/support/how-do-i-fix-the-pgvector-could-not-open-extension-control-file-error/>
- ingress-nginx install guide: <https://kubernetes.github.io/ingress-nginx/deploy/>
- cert-manager Helm install: <https://cert-manager.io/docs/installation/helm/>
- cert-manager Cloudflare DNS-01: <https://cert-manager.io/docs/configuration/acme/dns01/cloudflare/>
- Cloudflare proxy status: <https://developers.cloudflare.com/dns/proxy-status/>
- Cloudflare Full (Strict): <https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/>
- Cloudflare Origin CA: <https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/>
- Dokploy installation: <https://docs.dokploy.com/docs/core/installation>
- Dokploy applications: <https://docs.dokploy.com/docs/core/applications>
- Dokploy build type: <https://docs.dokploy.com/docs/core/applications/build-type>
- Dokploy Cloudflare domain guide: <https://docs.dokploy.com/docs/core/domains/cloudflare>
- Dokploy Docker Compose persistence/networking: <https://docs.dokploy.com/docs/core/docker-compose>

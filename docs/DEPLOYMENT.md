# Deployment

Fresh clone → configure env → migrate → run. Production uses Docker images + Kubernetes. Do not use `prisma db push` against production.

## Prerequisites

- Node 22, pnpm 9, Go 1.23, Docker
- PostgreSQL 16 (local Compose or managed)
- Supabase project (Auth)
- Optional: Stripe and/or Razorpay accounts

## Environment variables

Copy `.env.example` to `.env`. Names only — never commit values.

| Group | Names |
|---|---|
| App | `NODE_ENV`, `WEB_URL`, `API_PORT`, `NEXT_PUBLIC_API_URL`, `ALLOW_INSECURE_WEB_URL` |
| Database | `DATABASE_URL` |
| Supabase (public / web **build**) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Supabase (server) | `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| Worker | `WORKER_ID`, `WORKER_CONCURRENCY`, `WORKER_HEALTH_PORT`, `JOB_*`, `SHUTDOWN_TIMEOUT`, `SMTP_*` |

`NEXT_PUBLIC_*` is inlined when the **web image** is built. Changing Kubernetes env later does not update the browser bundle; rebuild the image.

Production API refuses placeholder JWT secrets and non-HTTPS `WEB_URL` unless `ALLOW_INSECURE_WEB_URL=true` (local Compose only).

## Local (developer)

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d postgres
pnpm install
pnpm db:migrate:deploy    # or pnpm db:migrate during active development
pnpm db:seed              # optional
pnpm dev
```

Health:

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/ready
curl -s http://localhost:8081/health   # worker
curl -s http://localhost:3000/health
```

If migrate exits with **P3005** (schema is not empty), that database was previously created with `db push` rather than migrations. Either:

```bash
docker compose -f deploy/docker-compose.yml down -v   # destroys local data
docker compose -f deploy/docker-compose.yml --profile stack up --build
```

or baseline: `prisma migrate resolve --applied <migration_name>` for each existing migration (staging/production should never need this if they only used `migrate deploy`).

Builds production images, runs migrations once, then API + worker + web:

```bash
docker compose -f deploy/docker-compose.yml --profile stack up --build
```

That stack publishes `5432`, `4000`, `3000`, and `8081`. Stop local `pnpm dev` first if those ports are already bound.

Postgres data is the `crm_pg` volume. Compose sets `ALLOW_INSECURE_WEB_URL=true` because `WEB_URL` is `http://localhost:3000`. Next.js in Compose sets `HOSTNAME=0.0.0.0` so container healthchecks can reach `/health` on loopback.

## Staging / production Kubernetes

Prefer **managed PostgreSQL** in production. The in-cluster StatefulSet is for small staging clusters only.

Order:

1. Build and tag images with the git SHA (`crm-api:<sha>`, `crm-web:<sha>`, `crm-worker:<sha>`). Pass production `NEXT_PUBLIC_*` as web build-args.
2. Create namespace, ConfigMap, and real Secrets (not `replace-me`).
3. Apply Postgres **or** point `DATABASE_URL` at the managed instance and skip `postgres.yaml`.
4. Apply and wait for `prisma-migrate` Job (`migrate-job.yaml`). Do not roll API if the Job failed.
5. Deploy API, wait for readiness.
6. Deploy worker and web.
7. Apply Ingress + TLS (`cert-manager` annotation is a template — set your issuer and hosts).

Validate with Kustomize (not `kubectl apply -f`, which also tries to apply `kustomization.yaml`):

```bash
kubectl apply --dry-run=client -k deploy/k8s
# After editing hosts, images, and secrets:
kubectl apply -k deploy/k8s
kubectl -n crm wait --for=condition=complete job/prisma-migrate --timeout=180s
```

Webhook URLs (replace host):

```text
https://api.example.com/webhooks/stripe
https://api.example.com/webhooks/razorpay
```

## CI/CD

- Pull requests and `main`: `.github/workflows/ci.yml` (lint, typecheck, test, build, Go, Docker build without push).
- Image push: `.github/workflows/publish-images.yml` (`workflow_dispatch`, GitHub Environment `production`). CI does **not** auto-deploy to the cluster.

## Rollback

1. Redeploy the previous **image SHA** for web/api/worker.
2. Do **not** automatically reverse Prisma migrations. If the release only changed application code, image rollback is enough.
3. If the release included a destructive schema change, restore the database from backup first (see `docs/BACKUP_AND_RECOVERY.md`).

## Troubleshooting

| Symptom | Check |
|---|---|
| API crash on boot | `DATABASE_URL`, `SUPABASE_JWT_SECRET`, `WEB_URL` https |
| Web login empty | Rebuild web image with real `NEXT_PUBLIC_SUPABASE_*` |
| Web container unhealthy, site still loads | Next.js bound to container hostname; set `HOSTNAME=0.0.0.0` (image/Compose/K8s already do) |
| `/ready` 503 | Postgres reachable from the API pod |
| Jobs stuck | Worker replicas, `jobs` table, `LOCKED` rows older than lock timeout |
| Billing checkout 503 | Provider secrets + plan price IDs in `billing_plans` |
| Duplicate migrate Job | Delete the completed Job before re-apply; do not run migrate from every API replica |
| Migrate Job cannot reach Postgres | Job pods must be labeled `app: migrate` (the NetworkPolicy allow-list) |

## Smoke tests (non-destructive)

After deploy: health/ready, load `/login`, authenticate, open dashboard, contacts, companies, deals, pipeline, tasks, notifications, analytics, search, billing (ADMIN). Do not run live charges in production smoke tests.

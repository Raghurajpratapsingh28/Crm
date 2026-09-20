# Company CRM

Multi-tenant CRM monorepo: Next.js web, Express API, Prisma/PostgreSQL, Supabase Auth, Go worker. Local Postgres via Docker Compose; production target is Kubernetes.

Product notes live in [`docs/PRD.md`](./docs/PRD.md). Runtime design is in [`ARCHITECTURE.md`](./ARCHITECTURE.md). Data model: [`docs/ERD.md`](./docs/ERD.md). Auth: [`docs/AUTH.md`](./docs/AUTH.md). Tenancy: [`docs/TENANCY.md`](./docs/TENANCY.md). RBAC: [`docs/RBAC.md`](./docs/RBAC.md). Authorization: [`docs/AUTHORIZATION.md`](./docs/AUTHORIZATION.md). Team: [`docs/TEAM_MANAGEMENT.md`](./docs/TEAM_MANAGEMENT.md). Invitations: [`docs/INVITATIONS.md`](./docs/INVITATIONS.md). Billing: [`docs/BILLING.md`](./docs/BILLING.md).

## Stack

| Layer | Path |
|---|---|
| Web | `apps/web` — Next.js + TypeScript |
| API | `apps/api` — Express + TypeScript + Prisma |
| Worker | `apps/worker` — Go |
| Shared types | `packages/types` |
| Shared TSConfig | `packages/tsconfig` |
| Compose + k8s | `deploy/` |

## Prerequisites

- Node 22 (`nvm use`)
- [pnpm 9](https://pnpm.io)
- Go 1.23+
- Docker (for PostgreSQL)

## First-time setup

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up -d postgres
pnpm install
pnpm db:push
```

`pnpm install` generates the Prisma client. Edit `.env` with real Supabase keys before signup/login. Never put `SUPABASE_SERVICE_ROLE_KEY` in a `NEXT_PUBLIC_` variable. See [`docs/AUTH.md`](./docs/AUTH.md). Prefer `pnpm db:migrate` / `pnpm db:migrate:deploy` over `pnpm db:push` once you care about migration history (always in staging/production).

## Development

## Development

```bash
pnpm dev                 # web :3000, api :4000, worker
# or one app:
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

Smoke checks:

```bash
curl -s http://localhost:4000/health
curl -s http://localhost:4000/ready
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000
```

`/health` is process liveness (no DB). `/ready` pings PostgreSQL.

## Other commands

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format
pnpm format:check
pnpm build
pnpm db:validate
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:seed
```

Go worker (from repo root):

```bash
pnpm dev:worker
# or
(cd apps/worker && go run ./cmd/worker)
(cd apps/worker && go build -o bin/worker ./cmd/worker)
```

## Docker

Postgres only (normal local path):

```bash
docker compose -f deploy/docker-compose.yml up -d postgres
docker compose -f deploy/docker-compose.yml config
```

Full image stack (needs a filled `.env`):

```bash
docker compose -f deploy/docker-compose.yml --profile stack up --build
```

Kubernetes templates: `deploy/k8s/`. Liveness uses `/health`, readiness uses `/ready` (API/worker). Web exposes `GET /health`. Production deploy, backups, and rollback: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md), [`docs/BACKUP_AND_RECOVERY.md`](./docs/BACKUP_AND_RECOVERY.md), [`docs/PRODUCTION_CHECKLIST.md`](./docs/PRODUCTION_CHECKLIST.md).

## API layout

```
apps/api/src/
  config/        env validation
  modules/       HTTP routes
  auth/          permission constants re-export
  services/      permission, ownership, audit
  middleware/    auth, tenant, permissions, request id, logging, errors
  lib/           prisma, supabase, queue, payment clients
  utils/         errors, logger, async handler
  app.ts         Express app
  server.ts      listen + graceful shutdown
```

The API stays request/response. Long-running work is a row in `jobs`; the Go worker claims it with `FOR UPDATE SKIP LOCKED`. See `docs/JOBS.md` and `docs/WORKER.md`.

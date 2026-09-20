# Company CRM Implementation Audit

Date: 2026-09-20. Evidence is from the repository after productionization (Prompts 14–15).

## Executive Summary

The CRM is a multi-tenant SaaS: Next.js UI, Express API, Prisma/PostgreSQL, Supabase Auth, Go worker, Stripe + Razorpay billing. Core product modules, RBAC, tenant isolation, jobs, analytics, search, and billing were already implemented. This phase closed production gaps: MEMBER object-level linking, Docker non-root images, Kubernetes hardening, GitHub Actions, migration Job, health probes, and operational docs.

**Launch posture:** ready for staging and a first production tenant **after** replacing secret placeholders, pointing at managed PostgreSQL, configuring Supabase + payment webhooks, and running the smoke checklist. In-cluster Postgres is not HA.

## Product Requirements

| Requirement | Status | Evidence | Changes |
|---|---|---|---|
| Auth (Supabase JWT) | IMPLEMENTED | `docs/AUTH.md`, `apps/api/src/middleware/auth.ts` | None |
| Organizations / tenancy | IMPLEMENTED | `docs/TENANCY.md` | None |
| RBAC ADMIN/MANAGER/MEMBER | IMPLEMENTED | `packages/types` `ROLE_PERMISSIONS` | MEMBER link visibility aligned with GET |
| Companies / contacts / deals / pipeline | IMPLEMENTED | Module services + tests | MEMBER cannot attach hidden records |
| Lead as first deal stage | IMPLEMENTED | Pipeline seed stages; `/leads` redirects to `/pipeline` | Redirect replaces placeholder page |
| Activities / tasks | IMPLEMENTED | Follow-up docs | Visibility on create/link |
| Notifications / jobs / worker | IMPLEMENTED | `docs/JOBS.md`, `docs/WORKER.md` | None |
| Analytics / search | IMPLEMENTED | `docs/ANALYTICS.md`, `docs/GLOBAL_SEARCH.md` | None |
| Billing Stripe + Razorpay | IMPLEMENTED | `docs/BILLING.md` | Fake provider remains test-only (`VITEST` / `NODE_ENV=test`) |
| Docker / k8s / CI | IMPLEMENTED | `deploy/`, `.github/workflows/` | Productionized this phase |

`docs/PRD.md` is still a working PRD template (personas/metrics unfinished). Engineering follows the implemented architecture, not invented product scope.

## Authentication

IMPLEMENTED. Supabase owns passwords. API verifies JWT (`jose`), rejects missing/invalid/expired tokens (`auth.test.ts`). Inactive memberships are excluded in `requireTenant`.

## Multi-Tenancy

IMPLEMENTED. `organizationId` comes from membership. Client `organizationId` is rejected (`rejectProtectedFields`). Cross-tenant GET/PATCH/DELETE return 404 (`rbac.test.ts`).

## RBAC

IMPLEMENTED. Permissions on every sensitive route. Last-admin protection. Self role-change blocked. Frontend `can()` is display-only.

## CRM / Pipeline / Activities / Tasks

IMPLEMENTED. Stage changes are transactional (deal + history + activity + audit). Lost reason required. MEMBER object-level **create/link** now uses `assertVisibleOwned` via `assertActorCanLinkRelations`.

## Notifications / Analytics / Search / Billing

IMPLEMENTED. Tenant-scoped. Billing mutations ADMIN (`billing.manage`). Webhooks: raw body, signature, unique event id, enqueue, 200.

## Worker

IMPLEMENTED. `SKIP LOCKED`, retries, SIGTERM drain, `/health` `/ready` on 8081. Multiple replicas are safe (row locks + idempotent handlers).

## Docker

IMPLEMENTED. Multi-stage images, non-root UID/GID 10001, healthchecks, no secrets baked (web `NEXT_PUBLIC_*` are **build-args**). Next.js standalone requires `HOSTNAME=0.0.0.0` (Docker sets `HOSTNAME` to the container id, which breaks 127.0.0.1 probes). API image runs `prisma generate` inside the deployed `/out` tree so ESM named exports work. Compose: postgres default; `--profile stack` for full stack + migrate. Worker strips Prisma `schema=` from `DATABASE_URL` (lib/pq rejects it).

## Kubernetes

IMPLEMENTED. Namespace, ConfigMap, secret templates, Deployments with probes/resources/securityContext, ClusterIP services, TLS ingress template, migrate Job, postgres NetworkPolicy. Image tags should be git SHA in production, not only `latest`.

## CI/CD

IMPLEMENTED. `.github/workflows/ci.yml` runs lint, typecheck, tests, build, Go test/build, Docker build (no push). Image publish is **manual** (`workflow_dispatch`) with a `production` environment gate.

## Security

See `docs/PRODUCTION_CHECKLIST.md`. Rate limits are **in-memory per pod** (not Redis). Fine for v1; abuse controls are not globally coordinated across replicas.

## Testing

API, web, and worker tests exist for IDOR, RBAC, billing webhooks, jobs. Live Stripe/Razorpay checkout is not run in CI.

## Observability

Structured Pino logs + request id on the API. Worker slog. No Prometheus/Grafana (intentionally not added).

## Frontend / Accessibility

Loading/empty/error patterns exist on major CRM pages. Billing and search have keyboard/dialog coverage. Not a WCAG certification pass.

## Known Risks

- Managed DB, TLS issuer, and real secrets are operator-owned.
- `NEXT_PUBLIC_*` must be present at **image build**.
- In-memory rate limits per replica.
- Webhook/email SMTP empty means invites stay in-app unless SMTP is set.
- Rolling back past an irreversible migration is unsafe.
- Local Compose volume created with `prisma db push` cannot run `migrate deploy` until baselined (P3005).
- `docker compose --profile stack up` needs free host ports 3000/4000/5432/8081.

## Remaining Work

- Staging deploy with real Supabase + one payment provider.
- Backup verification on the chosen managed database.
- Optional: shared rate limiting if replica count grows.

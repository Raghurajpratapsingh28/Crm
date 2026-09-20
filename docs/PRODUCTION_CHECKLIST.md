# Production Readiness Checklist

Use this before the first production cutover. Check an item only after it is true in the target environment.

## Application

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass on the release SHA
- [ ] Prisma migrations applied with `prisma migrate deploy` (never `db push` in production)
- [ ] `/health` and `/ready` succeed on API and worker; `/health` succeeds on web
- [ ] Signup, login, org onboarding, company, contact, deal, pipeline move, task, notification, search, analytics, billing page all work in staging

## Authentication

- [ ] Supabase project is production (not a leftover local stub)
- [ ] `SUPABASE_JWT_SECRET` is the project's JWT secret, not `dev-change-me`
- [ ] Passwords are not stored in CRM tables
- [ ] Deactivated members cannot call tenant APIs

## Authorization

- [ ] ADMIN can manage billing and team; MANAGER cannot
- [ ] MEMBER cannot escalate role via API
- [ ] Last remaining ADMIN cannot be demoted or deactivated
- [ ] Cross-org IDs return 404 (not 403 with existence leak) for CRM records

## Database

- [ ] Production uses **managed PostgreSQL** with automated backups
- [ ] In-cluster `postgres` StatefulSet is not used for production HA
- [ ] Connection string uses TLS where the provider requires it
- [ ] Billing FKs remain `ON DELETE RESTRICT` (do not cascade-delete invoices)

## Security

- [ ] No live secrets in git (`sk_live_`, `rzp_live_`, service role, JWT)
- [ ] CORS origin is exactly `WEB_URL` (not `*`)
- [ ] Ingress is HTTPS only
- [ ] Webhooks verify signatures on the raw body
- [ ] Containers run as UID 10001
- [ ] Postgres Service is ClusterIP only
- [ ] Web image does not contain Stripe/Razorpay secrets

## Billing

- [ ] Test mode keys never mix with live price/plan IDs
- [ ] Webhook URLs: `https://<api-host>/webhooks/stripe` and `/webhooks/razorpay`
- [ ] Checkout ignores client `amount` / `organizationId`
- [ ] Browser return from checkout is not treated as paid

## Worker

- [ ] At least one replica running
- [ ] `WORKER_ID` unique per pod (`metadata.name`)
- [ ] SMTP configured if invitation email is required
- [ ] SIGTERM drain observed (`terminationGracePeriodSeconds` > `SHUTDOWN_TIMEOUT`)

## Docker

- [ ] Images tagged with the git SHA
- [ ] Web image built with production `NEXT_PUBLIC_*` build-args
- [ ] Healthchecks pass locally (`docker compose --profile stack`)

## Kubernetes

- [ ] `kubectl apply --dry-run=client -k deploy/k8s` is valid
- [ ] Secrets created from a secret manager, not the committed placeholders
- [ ] Migration Job completed **before** API rollout
- [ ] Readiness gates new pods
- [ ] Resource requests/limits present (starting points; tune from staging)

## CI/CD

- [ ] GitHub Actions CI green on the release SHA
- [ ] Production image push is manual (`Publish images` workflow) or similarly gated
- [ ] No workflow auto-deploys to production without approval

## Observability

- [ ] Logs include `requestId` / worker id without secrets
- [ ] Failed jobs visible in `jobs` (`FAILED` / attempts)

## Backups

- [ ] Provider backup schedule documented in `docs/BACKUP_AND_RECOVERY.md`
- [ ] Restore drill completed at least once on staging

## Testing

- [ ] IDOR, RBAC, webhook, and billing tests included in CI
- [ ] Staging smoke test (non-destructive) recorded

## Documentation

- [ ] `docs/DEPLOYMENT.md` followed for this environment
- [ ] Webhook and billing runbooks read by the on-call

## Launch Verification

- [ ] Health endpoints
- [ ] Login
- [ ] Create company / contact / deal
- [ ] Move deal (including lost reason)
- [ ] Search
- [ ] Billing page loads for ADMIN
- [ ] Second organization cannot read the first organization's IDs

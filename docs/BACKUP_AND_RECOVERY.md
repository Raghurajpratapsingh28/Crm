# Backup and Recovery

This repository does **not** configure a backup agent. Production durability depends on the PostgreSQL provider you choose.

## Recommendation

Use **managed PostgreSQL** (RDS, Cloud SQL, Neon, Supabase database, etc.) for production. Keep the in-cluster StatefulSet for local/staging only.

## RPO / RTO (targets — set numbers with your provider)

| Environment | RPO target | RTO target | How |
|---|---|---|---|
| Local Compose | none | recreate volume | `crm_pg` Docker volume |
| Staging in-cluster Postgres | 24h (if you add snapshots) | hours | Volume snapshots you configure |
| Production managed Postgres | **≤ 5–15 minutes** (PITR if available) | **≤ 1 hour** | Provider automated backups + PITR |

Do not claim a backup exists until the provider dashboard shows a successful backup and you have restored it once on staging.

## Backup frequency and retention

Follow the managed provider:

- Daily full backup (or continuous WAL) with at least **7–14 days** retention for production.
- Point-in-time recovery if the product requires undoing accidental deletes.

CRM billing rows (`subscriptions`, `invoices`, `payment_events`) use `ON DELETE RESTRICT` from `organizations` so org deletion does not wipe financial history.

## Restore (managed)

1. Freeze deploys. Scale API/worker to 0 if you must avoid writes.
2. Restore a new instance or overwrite using the provider's restore UI/API to a **new** database when possible.
3. Point `DATABASE_URL` at the restored instance.
4. Run `prisma migrate deploy` only if the restored schema is behind the application SHA. Prefer restoring a backup taken from the same schema version as the images you will run.
5. Scale API/worker back up. Confirm `/ready`.
6. Smoke test login and a read-only CRM list.

## Restore (in-cluster PVC — staging)

1. Snapshot the PVC using the storage class / CSI snapshot API **before** experiments.
2. Recreate the StatefulSet from snapshot. This is not a substitute for managed PITR.

## Application images

Images are immutable (git SHA tags). Restoring the app without the database is: deploy the last known good SHA. Restoring the database without matching migrations can fail; keep backup + image SHA paired.

## What is not backed up by Postgres

- Supabase Auth users (use Supabase backups / export).
- Stripe/Razorpay objects (providers are system of record for money movement; CRM stores references).
- Kubernetes Secrets (store in a secret manager).

## Disaster scenarios

| Failure | Application behavior | Operator action |
|---|---|---|
| API down | UI cannot mutate; worker may still drain jobs | Roll pods; check `/health` |
| Worker down | Jobs queue in Postgres; CRM UI still works | Restore worker Deployment |
| Database down | API `/ready` 503; worker `/ready` fails | Fail over / restore DB |
| Stripe/Razorpay down | Checkout/reconcile fail; CRM otherwise up | Retry; do not mark paid from the browser |
| Bad deploy | Readiness should keep old pods serving | Roll back image SHA |
| Node loss | Kubernetes reschedules; PVC follows if storage allows | Check PVC binding |

## Verification

At least once per quarter on staging: restore a backup to a throwaway instance, run `prisma migrate deploy` if needed, hit `/ready`, log in.

# Jobs

The CRM API stays request/response. Slow or retryable work is a row in PostgreSQL `jobs`. The Go worker claims those rows. There is **one** queue: this table. Do not add Redis, NATS, Kafka, or a second jobs table.

## Lifecycle

```text
PENDING → RUNNING → SUCCEEDED
                 ↘ PENDING (retry, available_at in the future)
                 ↘ FAILED   (dead-letter after max attempts or a permanent error)
```

Existing enum names are kept on purpose:

| Spec name | Database value |
| --- | --- |
| PROCESSING | `RUNNING` |
| COMPLETED | `SUCCEEDED` |
| last_error | `jobs.error` |
| FAILED | dead-letter / exhausted |

## Claiming

Workers claim a bounded batch (`JOB_BATCH_SIZE`, 1–50) with:

```sql
SELECT … FROM jobs
WHERE (status = 'PENDING' AND available_at <= now())
   OR (status = 'RUNNING' AND locked_at < now() - JOB_LOCK_TIMEOUT)
ORDER BY available_at
FOR UPDATE SKIP LOCKED
LIMIT $batch
```

The claim transaction updates `status = RUNNING`, `locked_at`, `locked_by`, and increments `attempts`, then **commits**. Handlers run after commit so email or other I/O does not hold row locks.

`locked_by` is the worker instance id (`WORKER_ID`, Kubernetes pod name, or `hostname-pid`).

## Retry

Retryable failures (network, database, provider 5xx) reschedule:

```text
delay = min(JOB_RETRY_BASE_DELAY × 2^(attempt-1), JOB_MAX_BACKOFF) + jitter
```

Defaults: base 30s, max backoff 1h, jitter 5s, max attempts 5.

Permanent failures (unknown type, invalid payload, unsupported notification type) go to `FAILED` immediately. After `attempts >= max_attempts`, retryable errors also become `FAILED`. `error` is stored truncated to 2,000 characters.

## Idempotency

Jobs may run more than once. Side effects must be safe:

- In-app notifications use unique `notifications.dedupe_key`.
- Invitation email is **at-least-once**. SMTP has no exactly-once API. The worker never logs `acceptUrl` or the raw token.
- Payment webhooks remain unique on `(provider, provider_event_id)`.

Critical domain events enqueue inside the same Prisma transaction as the CRM write:

```text
BEGIN
  update deal / task / invitation
  insert audit
  insert job
COMMIT
```

Payloads are JSON with `version: 1` and IDs, not full records. No passwords, JWTs, SMTP secrets, or invitation tokens except the delivery URL on `email.invite`.

## Job types

Defined in `@crm/types` `JobType` and `apps/worker/internal/jobs`. Adding a job is: constant → handler → register → enqueue → test.

| Type | Handler |
| --- | --- |
| `email.invite` | Invitation email |
| `email.receipt` / `email.follow_up` | Reserved email |
| `notification.fanout` | In-app notification |
| `payments.event` | Apply stored payment snapshot |
| `payments.reconcile` / `payments.dunning` | Reconcile / failed payment |
| `payments.subscription` / `payments.invoice` | Live provider fetch |
| `analytics.rollup` / `deals.flag_stale` | Reserved (dashboard uses live SQL, not rollups) |
| `tasks.remind` | Reminder/overdue sweep |

## Retention

A worker ticker deletes old rows in batches of 1,000:

- `SUCCEEDED` older than `JOB_COMPLETED_RETENTION` (default 14 days)
- `FAILED` older than `JOB_FAILED_RETENTION` (default 90 days)

`PENDING` and `RUNNING` are never purged. Failed rows stay long enough to inspect in SQL; there is no admin UI in this milestone.

## Indexes

`(status, available_at)`, `(organization_id, status)`, `(status, locked_at)`, `(status, processed_at)`, `(created_at)`.

## Enqueue API

`apps/api/src/lib/queue.ts` `enqueue(type, payload, { organizationId, client, availableAt, maxAttempts, requestId })`. Pass `client: tx` inside `prisma.$transaction`. Request ids come from `x-request-id` via async local storage when omitted.

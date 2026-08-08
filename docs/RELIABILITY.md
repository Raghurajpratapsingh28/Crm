# Reliability

## Transaction rule

For important domain events, CRM state and the job row commit together:

```text
BEGIN
  UPDATE crm row
  INSERT audit_logs
  INSERT jobs
COMMIT
```

Then the HTTP response returns. The worker claims later. If the worker is down, the API still succeeds and work waits in `PENDING`.

Do not: commit the deal, then insert the job. A crash between those steps would leave a deal without a notification.

`enqueue(..., { client: tx })` participates in the Prisma transaction. Invitation create/resend, deal assign/stage, task assign, and team membership events use this path.

## Failure handling

| Failure | Result |
| --- | --- |
| Retryable handler error | `PENDING`, `available_at` = now + exponential backoff + jitter |
| Permanent handler error | `FAILED` immediately (`error` set, `failed_at` set) |
| `attempts >= max_attempts` | `FAILED` (dead-letter) |
| Worker crash while `RUNNING` | Another worker reclaims after `JOB_LOCK_TIMEOUT` |
| Duplicate claim | `FOR UPDATE SKIP LOCKED` |
| Duplicate notification | Unique `dedupe_key` |
| Inactive / missing recipient | Job succeeds, no row (no retry storm) |
| Unknown job type | `FAILED`, no retry |

Duplicate execution is expected. Idempotent side effects are the guarantee, not exactly-once handlers.

## Email

Invitation mail is at-least-once. If SMTP succeeds and the process dies before `SUCCEEDED`, a retry may send a second message. The worker never logs the accept URL. Locally, missing `SMTP_HOST` completes the job without sending.

## Concurrency and backpressure

Bounded claim size, bounded goroutine semaphore, bounded DB pool, idle wait when the queue is empty. Workers do not `SELECT` the entire `jobs` table.

## Observability

Structured logs plus timestamps on `created_at`, `locked_at`, `processed_at`, `failed_at`, `attempts`. Prometheus is not introduced in this milestone. The operational signal “oldest pending job” can be queried:

```sql
SELECT min(available_at) FROM jobs WHERE status = 'PENDING';
```

Inspect failed/stuck jobs in SQL:

```sql
SELECT id, type, status, attempts, locked_by, locked_at, error
FROM jobs
WHERE status IN ('RUNNING', 'FAILED')
ORDER BY updated_at DESC;
```

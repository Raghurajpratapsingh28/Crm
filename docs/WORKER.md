# Worker

`apps/worker` is a Go process. It does not serve product HTTP. It claims PostgreSQL jobs, sends email, inserts in-app notifications, and sweeps task reminders.

## Run locally

```bash
cd apps/worker
go run ./cmd/worker
```

Or `pnpm dev:worker` from the repo root. The API keeps working if the worker is stopped; jobs stay `PENDING`.

An empty queue is normal: the worker logs `worker_started` once and then waits on `JOB_POLL_INTERVAL`.

## Startup

1. Load and validate configuration (missing `DATABASE_URL` in production exits non-zero).
2. JSON structured logs (`log/slog`).
3. Open PostgreSQL with a bounded pool.
4. Ping the database.
5. Register handlers.
6. Start `/health` and `/ready` on `WORKER_HEALTH_PORT` (default 8081).
7. Start reminder and retention tickers.
8. Poll / claim / process.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | local docker URL | Postgres |
| `WORKER_ID` | `hostname-pid` | `locked_by` |
| `WORKER_CONCURRENCY` | 10 | Max in-flight jobs |
| `JOB_POLL_INTERVAL` | 2s | Idle wait (`WORKER_POLL_INTERVAL_MS` still works) |
| `JOB_BATCH_SIZE` | 20 | Claim size (max 50) |
| `JOB_LOCK_TIMEOUT` | 5m | Reclaim stale `RUNNING` jobs |
| `JOB_MAX_ATTEMPTS` | 5 | Then `FAILED` |
| `JOB_RETRY_BASE_DELAY` | 30s | Exponential base |
| `JOB_MAX_BACKOFF` | 1h | Cap |
| `JOB_RETRY_JITTER` | 5s | Bound jitter |
| `SHUTDOWN_TIMEOUT` | 25s | Drain in-flight jobs |
| `WORKER_HEALTH_PORT` | 8081 | Probes |
| `DB_MAX_OPEN_CONNECTIONS` | 10 | Pool |
| `DB_MAX_IDLE_CONNECTIONS` | 5 | Pool |
| `TASK_REMINDER_HOURS` | 24 | Upcoming window |
| `SMTP_HOST` | empty | If unset, invite email succeeds after a safe log line |

The worker must **not** receive `NEXT_PUBLIC_*` secrets or a browser Supabase key. It needs `DATABASE_URL` and optional SMTP.

## Shutdown

`SIGINT` / `SIGTERM` stop new claims, wait for in-flight jobs up to `SHUTDOWN_TIMEOUT`, close the health server, close the pool, log `worker_shutdown`. Kubernetes `terminationGracePeriodSeconds: 30` is slightly larger than the drain timeout.

## Health

- `GET /health` — process up
- `GET /ready` — database ping

No public Service/LoadBalancer. Kubelet probes the pod IP.

## Handlers

`internal/jobs.Registry` maps type → handler. Unknown types are permanent failures (`job_unknown_type`). Do not grow a switch in the poller.

Notification fan-out validates the recipient is an **ACTIVE** member of the payload organization. Missing or deactivated users skip insert and the job succeeds (no retry loop). Duplicate `dedupe_key` is success.

## Logging

Events include `worker_started`, `worker_shutdown`, `job_claimed`, `job_started`, `job_completed`, `job_retry`, `job_failed`, `job_recovered`, `job_unknown_type`, `notification_created`. Fields: `job_id`, `job_type`, `attempt`, `duration_ms`, `request_id` when present. Never log invitation tokens, SMTP passwords, or full email bodies.

## Docker / Kubernetes

Image: multi-stage Go build, Alpine runtime, non-root user `10001`, no source in the final image.

Deployment: 2 replicas, 50m/64Mi request, 500m/256Mi limit, probes on 8081, `WORKER_ID` from pod name.

## Tests

```bash
cd apps/worker
go test ./...
go build ./...
```

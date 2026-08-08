# Tasks

Tasks are actionable follow-ups: what needs to happen next. They are not activities.

## Model

`tasks`

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `organization_id` | From tenant context |
| `title` | Required |
| `description` | Optional |
| `status` | `OPEN` or `DONE` only |
| `due_date` | Optional timestamptz |
| `completed_at` | Set on complete, cleared on reopen |
| `assignee_id` | Active org member |
| `created_by` | Authenticated actor |
| `deal_id` / `contact_id` / `company_id` | Optional related records |

Overdue is derived: `status = OPEN AND due_date < now`. It is never stored as a status.

Indexes: `(organization_id, status)`, `(organization_id, due_date)`, `(organization_id, assignee_id, status)`, deal/contact/company composites, and `(status, due_date)` for reminder sweeps.

## API

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/tasks` | `tasks.read` |
| `POST` | `/api/v1/tasks` | `tasks.create` |
| `GET` | `/api/v1/tasks/:id` | `tasks.read` |
| `PATCH` | `/api/v1/tasks/:id` | `tasks.update` |
| `DELETE` | `/api/v1/tasks/:id` | `tasks.delete` |
| `POST` | `/api/v1/tasks/:id/complete` | `tasks.update` |
| `POST` | `/api/v1/tasks/:id/reopen` | `tasks.update` |
| `POST` | `/api/v1/tasks/:id/assign` | `tasks.update` plus assign role |

List query: `page`, `limit` (default 25, max 100), `search`, `status`, `assigneeId`, `dealId`, `contactId`, `companyId`, `dueDateFrom`, `dueDateTo` / `dueBefore`, `overdue`, `sortBy`, `sortOrder`.

Sort whitelist: `dueDate`, `createdAt`, `updatedAt`, `title`. Default `dueDate ASC`.

Responses include `isOverdue`. Completed tasks are never overdue.

## Lifecycle

- Complete is idempotent. A second complete keeps the original `completed_at` and does not write another `TASK_COMPLETED` audit.
- Reopen sets `OPEN` and clears `completed_at`. The due date is preserved, so a past due date becomes overdue again.
- Status cannot be changed through generic PATCH.
- Assignment requires an active same-org member. MEMBERS cannot assign other users.

## Reminders

`TASK_REMINDER_HOURS` (default 24) controls the upcoming window.

The Go worker sweeps open tasks:

- upcoming: `TASK_REMINDER:{taskId}:{dueDate ISO}`
- overdue: `TASK_OVERDUE:{taskId}:{YYYY-MM-DD}`

`notifications.dedupe_key` is unique, so retries and multiple worker replicas insert at most one notification.

## Visibility

ADMIN and MANAGER see organization tasks. MEMBER sees tasks they are assigned, they created, or that belong to a deal/company/contact they own.

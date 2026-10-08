# Notifications

In-app notifications are tenant- and recipient-scoped rows. Email is a separate channel (`email.invite` and later receipt mail). Not every notification sends email.

## Types

Prisma `NotificationType` / `@crm/types` `NotificationType`:

`LEAD_ASSIGNED`, `DEAL_ASSIGNED`, `DEAL_STAGE_CHANGED`, `DEAL_WON`, `DEAL_LOST`, `TASK_ASSIGNED`, `TASK_REMINDER`, `FOLLOW_UP_OVERDUE`, `TEAM_MEMBER_JOINED`, `MEMBER_ROLE_CHANGED`, `MEMBER_STATUS_CHANGED`, `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_RENEWED`, `SUBSCRIPTION_CANCELED`, `SUBSCRIPTION_PAST_DUE`, `PAYMENT_FAILED`, `INVOICE_AVAILABLE`, `PAYMENT_RECEIVED`.

Copy lives in `apps/api/src/lib/notification-copy.ts` (enqueue) and is mirrored in the Go worker for reminder sweeps and older jobs without title/message.

## Recipients

| Event | Job | Recipient | Skip |
| --- | --- | --- | --- |
| Member invited | `email.invite` | Invitee email | n/a (no in-app user yet) |
| Invitation accepted | `notification.fanout` `TEAM_MEMBER_JOINED` | Inviter | The joining user |
| Task assigned | `TASK_ASSIGNED` | New assignee | Self-assignment |
| Task due in `TASK_REMINDER_HOURS` | Sweep `TASK_REMINDER` | Assignee | Duplicate `TASK_REMINDER:{taskId}:{due ISO}` |
| Open task past due | Sweep `FOLLOW_UP_OVERDUE` | Assignee | Duplicate `TASK_OVERDUE:{taskId}:{YYYY-MM-DD}` |
| Deal owner A → B | `DEAL_ASSIGNED` | B | Self-assignment |
| Deal → Negotiation | `DEAL_STAGE_CHANGED` | Deal owner | Actor |
| Deal → Won | `DEAL_WON` | Deal owner | Actor |
| Deal → Lost | `DEAL_LOST` | Deal owner | Actor |

MVP does not fan out to the whole organization. Deal stage jobs include `stageHistoryId` and historical `fromStage` / `toStage` so a delayed worker still describes Proposal → Negotiation after the deal has moved on.

## Idempotency

`notifications.dedupe_key` is unique. Examples:

- `TASK_ASSIGNED:{taskId}:{fromUserId}:{toUserId}`
- `DEAL_ASSIGNED:{dealId}:{fromOwnerId}:{toOwnerId}`
- `DEAL_STAGE_CHANGED:{stageHistoryId}:{ownerId}`
- `TASK_REMINDER:{taskId}:{due ISO}`
- `TASK_OVERDUE:{taskId}:{YYYY-MM-DD}`

The worker treats `ON CONFLICT DO NOTHING` as success.

## API

All routes require auth, tenant, `notifications.read`, and existing API rate limits (90/min).

| Method | Path |
| --- | --- |
| GET | `/api/v1/notifications` (`page`, `limit` default 25 max 100, `unread`, `type`) |
| GET | `/api/v1/notifications/unread-count` |
| GET | `/api/v1/notifications/:id` |
| PATCH | `/api/v1/notifications/:id/read` |
| PATCH | `/api/v1/notifications/read-all` |

Visibility is always `organization_id = current org AND user_id = current user`. List sort is `created_at DESC`. Unread count is `COUNT(*)` where `read_at IS NULL`. Mark-read is idempotent. Mark-all-read updates currently unread rows only; notifications created afterward stay unread.

Response envelope is the existing `{ success, data }` shape. List `data` is `{ items, pagination }`. Unread count `data` is `{ count }`.

## Deep links

Routes are derived from `entity_type` + `entity_id` (fallback payload ids), never stored URLs:

| Entity | Path |
| --- | --- |
| DEAL | `/deals/:id` |
| TASK | `/tasks/:id` |
| CONTACT | `/contacts/:id` |
| COMPANY | `/companies/:id` |
| missing | `/notifications` |

If the record was deleted, the destination page shows its existing error state.

## Frontend

- Single `NotificationProvider` polls unread count + recent rows every 45s, refetches on tab focus, and clears the interval on unmount or logout.
- Accessible bell: `aria-label="Notifications"` or `Notifications, N unread`, keyboard (Escape closes), dropdown, badge, loading/empty/error.
- Click: optimistic read, then navigate. Failed PATCH restores unread state and shows an error.
- `/notifications` supports All / Unread, optional type filter, mark read, mark all read.

There is no WebSocket in this milestone.

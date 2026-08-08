# Deals

Deals are unified pipeline opportunities scoped by `organization_id` from authenticated membership.

## Model highlights

- `amount` as `Decimal(14,2)`, `currency` as 3-letter ISO code
- `probability` + `probabilitySource` (`STAGE_DEFAULT` | `MANUAL`)
- `wonAt` / `lostAt` timestamps
- `lostReason` enum + optional `lostReasonNote` for free-text detail
- Immutable `deal_stage_history` rows for every stage change

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/v1/deals` | `deals.read` |
| POST | `/api/v1/deals` | `deals.create` |
| GET | `/api/v1/deals/:id` | `deals.read` |
| PATCH | `/api/v1/deals/:id` | `deals.update` |
| DELETE | `/api/v1/deals/:id` | `deals.delete` |
| POST/PATCH | `/api/v1/deals/:id/stage` | `deals.update` |
| POST | `/api/v1/deals/:id/reset-probability` | `deals.update` |
| POST | `/api/v1/deals/:id/assign` | `deals.assign` |

List supports pagination, search, owner/company/pipeline/stage filters, amount and close-date bounds, whitelisted sorting.

Stage changes are **not** accepted through generic PATCH (protected fields).

## Probability rules

- Omitted on create → stage default + `STAGE_DEFAULT`
- Explicit value → `MANUAL`
- Stage move with `STAGE_DEFAULT` → adopt target stage probability
- Stage move with `MANUAL` → preserve manual probability (except Won → 100)
- `POST .../reset-probability` → current stage default + `STAGE_DEFAULT`

## Lost / Won

- Moving to Lost requires `lostReason` (`LOST_REASON_REQUIRED` otherwise)
- Won sets `wonAt` and probability 100
- Reopening from Won/Lost clears terminal timestamps and lost fields

## Notifications

Owner assignment, moves into Negotiation, Won, Lost, and reopen enqueue `notification.fanout` in the same database transaction as the deal write. The job carries `stageHistoryId` and historical stage names. The Go worker inserts the in-app notification. The actor is not notified about their own action. Recipients are the deal owner only.

## Concurrency

`transitionDealStage` locks the deal row (`SELECT … FOR UPDATE`) so two simultaneous moves serialize. Stage history remains a consistent chain. Repeating the current `stageId` is a no-op and does not create another `STATUS_CHANGE` activity. Successful moves write deal, history, activity, and audit together.

## Security

All reads/writes filter by organization. Company, contact, pipeline, stage, and owner must belong to the same organization. MEMBER visibility follows existing owner scope rules.

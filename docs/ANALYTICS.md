# Analytics

Dashboard and analytics metrics are computed in PostgreSQL by `apps/api/src/modules/analytics`. The browser renders JSON. It does not download CRM records and reduce them.

```text
Next.js
  → GET /api/v1/analytics/*
  → JWT + tenant middleware (organization_id from membership, never from the body)
  → requirePermission(analytics.read | analytics.team)
  → analytics service
  → Prisma/PostgreSQL aggregation
```

Metrics are **near-real-time**: they read current Postgres state. There is no warehouse, Redis cache, or `analytics.rollup` worker in this milestone.

## Timezone and dates

- Timestamps are stored in UTC.
- Calendar dates (`from`, `to`) are interpreted in the **organization timezone** (`organizations.timezone`), not the browser or API host timezone.
- Queries use a half-open interval: `[from 00:00, to+1day 00:00)` in that timezone, converted to UTC.
- Frontend date pickers show inclusive calendar days (`Sep 1 → Sep 30`). The API exclusive end is `Oct 1 00:00`.
- Default range is **this month** in the organization timezone. Preset names (`this_month`, `last_7`) are frontend-only; the API always receives `from` and `to`.
- Maximum range is 15 years. `from > to` returns `INVALID_DATE_RANGE`.
- Previous-period comparison uses the immediately preceding interval of the same number of calendar days (`Sep 1–30` → `Aug 2–31`). If the previous total is zero, the API returns `hasComparison: false` instead of `Infinity`.

## Currency

Deals keep their own ISO currency. There is no FX table.

- One currency: `amount` is a decimal **string** (`"1250000.00"`).
- Mixed currencies: `mixed: true`, `amount: null`, `byCurrency: [{ currency, amount }]`. Totals are never `₹ + $`.
- Organization `currency` is the display fallback, not a converted total.

## Visibility and permissions

| Permission | Who | What |
|---|---|---|
| `analytics.read` | ADMIN, MANAGER, MEMBER | Overview, pipeline, revenue, win-rate |
| `analytics.team` | ADMIN, MANAGER | Leaderboard, `teamId` / department filter |

`organizationId` is never a trusted query parameter. Every SQL predicate starts with `d.organization_id = authenticatedOrganizationId`.

Object visibility matches deals:

- ADMIN / MANAGER: organization deals (then owner / department / pipeline filters).
- MEMBER: `owner_id = current user` for deals; task `taskScope` and activity `activityScope` for follow-ups and the live feed.

A MEMBER dashboard therefore **computes** own-record revenue; it does not compute org revenue and hide it in the UI.

`teamId` maps to the existing **Department** enum (`SALES`, `MARKETING`, `MANAGEMENT`, `OTHER`). There is no second Team model. Filtering by department requires `analytics.team` (403 otherwise). Invalid department → `INVALID_TEAM`. Owner must belong to the authenticated org (active or deactivated) → else `INVALID_OWNER`. Unknown pipeline → `PIPELINE_NOT_FOUND`.

Leaderboard is `analytics.team` only. MEMBER requests return 403 even if the nav item is hidden.

## Metric definitions

### Revenue

- **Definition:** sum of amounts of deals whose **current** stage `is_won = true` and whose `won_at` falls in range.
- **Included:** current Won deals, counted once.
- **Excluded:** OPEN, LOST, reopened deals (`won_at` is cleared on leave-Won), other tenants, deals the user cannot see.
- **Date field:** `won_at` (not `created_at` / `updated_at`).
- A deal created in December and won in January counts in January.
- Won → Proposal → Won does not double-count: only the current `won_at` is used.

### Open deals

- Count of deals whose current stage has `is_won = false` AND `is_lost = false`.
- Current state only. Not date-filtered. Stage **names** are ignored.

### Leads

- Current deals in the Lead stage: `key = 'lead'`, or `lower(name) = 'lead'` when `key` is null.
- Not a historical “ever was a lead” count. Unified Deal model; no separate Lead table.

### Win rate

- `Won / (Won + Lost)` using current stage flags.
- Date filter: `won_at` in range for wins, `lost_at` in range for losses.
- Open deals are not in the denominator.
- `won + lost = 0` → `{ value: 0, hasData: false }` (dashboard copy: “No closed deals”, not a fake 0% performance).
- Percentages are rounded to **two decimal places** in the API (`38.46`).

### Pipeline value

- Sum of amounts of **currently open** deals whose `expected_close_date` is in the selected range (`[from, to)` as dates).
- Deals with a null expected close date are excluded from this KPI.
- Open deal **count** is still the unfiltered current snapshot (see above).
- Weighted pipeline: `sum(amount × probability / 100)` with SQL numeric math, same deal set.

### Follow-ups

- Source: `tasks` (not a parallel follow-up model).
- `open`: `status = OPEN` (current snapshot; not clipped by the dashboard date range).
- `overdue`: `status = OPEN` AND `due_date < now()` (snapshot). Completed tasks are never overdue.
- `dueToday`: OPEN tasks whose `due_date` falls on the organization-local calendar day.
- Owner filter uses `assignee_id`. Department filter uses the assignee’s membership.

### Recent activity

- Latest 10 `activities` by `occurred_at DESC`.
- Live feed: **not** filtered by the dashboard date range.
- Same `activityScope` as the timeline. Owner filter uses `author_id`.
- Inaccessible deals’ activities are not returned.

## Pipeline endpoint

`GET /api/v1/analytics/pipeline` returns **current** stage distribution for the selected (or default) pipeline, stages ordered by `order ASC`.

- Open stages: deals in that stage with `expected_close_date` in range.
- Won: current won deals with `won_at` in range.
- Lost: current lost deals with `lost_at` in range.

This is **not** a historical conversion rate. Cohort conversion from `DealStageHistory` is out of scope.

No pipeline configured → `{ pipeline: null, stages: [] }`.

## Revenue / win-rate series

`groupBy=day|week|month` (default `month`). Empty buckets are filled with zero so charts do not skip months. Week labels match PostgreSQL `to_char(..., 'IYYY-"W"IW')`.

## Leaderboard

`GET /api/v1/analytics/leaderboard` (`analytics.team`).

| Field | Meaning |
|---|---|
| `dealsWon` / `revenue` | Current owner of currently Won deals with `won_at` in range |
| `openPipeline` | Current owner of currently open deals with `expected_close_date` in range |

Attribution follows **current** `deal.owner_id`. There is no historical owner-at-win snapshot. One deal contributes to one owner. Stage history rows are not counted.

Sort is a display choice: `revenue` (default), `dealsWon`, `openPipeline`. The UI must not call anyone the “best salesperson”.

## Filters (all endpoints)

```text
from, to          YYYY-MM-DD, org timezone, [start, end)
ownerId           user in this organization
teamId            department enum (requires analytics.team)
pipelineId        pipeline in this organization
groupBy           day | week | month (revenue, win-rate)
sortBy            revenue | dealsWon | openPipeline (leaderboard)
```

Same filters apply to every dashboard section unless documented otherwise (recent activity is live; follow-up `open`/`overdue`/`dueToday` are current snapshots; open deal **count** is current state).

## Endpoints

```http
GET /api/v1/analytics/me
GET /api/v1/analytics/team
GET /api/v1/analytics/overview
GET /api/v1/analytics/pipeline
GET /api/v1/analytics/revenue
GET /api/v1/analytics/win-rate
GET /api/v1/analytics/leaderboard
```

`/me` and `/team` remain simple counts for existing RBAC tests.

Amounts are strings. Counts are integers. Errors: `401`, `403`, `400 INVALID_DATE_RANGE` / `INVALID_OWNER` / `INVALID_TEAM`, `404 PIPELINE_NOT_FOUND`, `429 RATE_LIMITED`. Database errors are not leaked.

## Query strategy

Separated functions: `getOverview`, `getPipeline`, `getRevenue`, `getWinRate`, `getLeaderboard`. Deal aggregations use parameterized `$queryRaw` (`COUNT` / `SUM` / `FILTER` / `GROUP BY`). Follow-ups and recent activity use Prisma `count` / `findMany` with the existing visibility scopes (OR clauses). No N+1 deal hydration.

Indexes added for this milestone:

- `deals (organization_id, won_at)`
- `deals (organization_id, lost_at)`
- `tasks (organization_id, status, due_date)`

Existing indexes already cover `organization_id + owner_id`, `stage_id`, `expected_close_date`, `activities (organization_id, occurred_at)`, `pipeline_stages (pipeline_id, order)`.

No Redis cache. Cache keys would have to include organization, visibility, and every filter; TTL caching is a later optimization.

Logging: `event=analytics`, endpoint, organization, user, duration. Result payloads are not logged.

## Out of scope

CSV/PDF export, scheduled reports, FX conversion, AI forecasting, cohort conversion, ClickHouse/BigQuery, auditing every dashboard GET.

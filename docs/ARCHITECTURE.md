# Architecture

pnpm + Turborepo. Three apps share `@crm/types`.

```text
apps/web     Next.js 15 (App Router)
apps/api     Express + Prisma + PostgreSQL
apps/worker  Go job worker
```

```text
Browser
  → Next.js (Supabase session)
  → Express /api/v1
  → JWT auth
  → Tenant (organization membership)
  → Permission (RBAC)
  → Object visibility (owner / assignee / activity scope)
  → Prisma
  → PostgreSQL
```

The browser is never trusted for `organizationId` or authorization.

## Apps

| App | Role |
|---|---|
| `web` | Authenticated CRM UI. `(app)` layout is `AuthGate` + nav + notifications + command palette. |
| `api` | REST. Modules own routes, validation, and services. Shared middleware: auth, tenant, permissions, rate limit, request id, logger. |
| `worker` | Claims `Job` rows and sends notifications / email / reminders. |

## Tenancy and RBAC

- JWT identifies the user. Tenant middleware loads the **active membership** and sets `organizationId` + `role`.
- Permissions live in `@crm/types` (`PERMISSIONS`, `ROLE_PERMISSIONS`). `requirePermission` / `requireAnyPermission` wrap handlers.
- Object visibility: `ownerScope` (contacts, companies, deals), `activityScope`, `taskScope` in `authorization.service.ts`. ADMIN/MANAGER = team/org; MEMBER = own (or authored / related) records.
- Detail GET handlers re-check visibility. List/search results are not a capability token.

See `docs/TENANCY.md`, `docs/RBAC.md`, `docs/AUTHORIZATION.md`.

## CRM modules

Unified **Deal** lifecycle (Lead is a stage, not a table). Contacts, companies, pipelines, activities, and tasks hang off the organization. Activities and tasks must relate to a deal, contact, or company in the same tenant.

Notifications are fan-out jobs. Analytics are live SQL aggregations (no warehouse). Global search is Prisma ILIKE over contacts, companies, deals, and activities. Billing is organization-level Stripe/Razorpay via a provider abstraction (`docs/BILLING.md`).

## Global search

```text
Command palette
  → GET /api/v1/search
  → Auth + tenant + CRM read permissions
  → ownerScope / activityScope
  → bounded ILIKE + deterministic rank
  → grouped results
  → existing detail routes
```

Details: `docs/GLOBAL_SEARCH.md`. Shortcuts: `docs/KEYBOARD_SHORTCUTS.md`.

## Frontend conventions

- Data access: `apiFetch` + bearer token from Supabase session.
- Permissions: `useAuth().can(PERMISSIONS.*)` for UI only.
- Dialogs: `ConfirmDialog` in `components/crm/ui.tsx`.
- Lists: `SearchInput`, `DataTable`, `FilterBar`.
- Errors: `{ success: false, error: { code, message }, requestId }` mapped by `crmErrorMessage`.

## API conventions

- Success: `{ success: true, data }`.
- Errors: `AppError` via `unauthorized` / `forbidden` / `invalid` / `fail`.
- Pagination defaults to 25, max 100, except search (default 20, max 50).
- Rate limits reuse `middleware/rate-limit.ts` (in-memory, per user).

## Observability

Request logs include method, path, status, duration, request id. Search and analytics add organization, user, and result timing **without** raw customer query strings. Pino redacts tokens and secrets.

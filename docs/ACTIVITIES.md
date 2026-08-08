# Activities

Activities are historical CRM events: what already happened. They are not tasks and they are not audit logs.

## Model

`activities`

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `organization_id` | From authenticated tenant context, never from the client |
| `type` | `CALL` `EMAIL` `MEETING` `NOTE` `STATUS_CHANGE` |
| `author_id` | Authenticated actor. Client-supplied `authorId` is rejected |
| `deal_id` / `contact_id` / `company_id` | Optional, at least one required for manual creates |
| `content` | Required for CALL/EMAIL/MEETING/NOTE |
| `occurred_at` | When the event happened |
| `created_at` | When the CRM row was written |
| `metadata` | Structured context, size-capped |

Indexes: `(organization_id, occurred_at)`, `(organization_id, deal_id)`, `(organization_id, contact_id)`, `(organization_id, company_id)`, `(organization_id, author_id)`.

## Types

- **Call / Email / Meeting / Note** — user-created
- **Status Change** — system-created when a deal moves stage, including Won, Lost, and reopen. Immutable

## API

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/activities` | `activities.read` |
| `POST` | `/api/v1/activities` | `activities.create` |
| `GET` | `/api/v1/activities/:id` | `activities.read` |
| `PATCH` | `/api/v1/activities/:id` | `activities.update` |
| `DELETE` | `/api/v1/activities/:id` | `activities.delete` |

List query: `page`, `limit` (default 25, max 100), `type`, `dealId`, `contactId`, `companyId`, `authorId`, `occurredFrom`, `occurredTo`, `search`, `sortBy`, `sortOrder`.

Sort whitelist: `occurredAt`, `createdAt`. Default newest `occurredAt` first.

Search covers activity content plus related deal, company, contact, and author names.

`POST` may include `followUp: { title, dueDate, assigneeId }` to create a task in the same transaction.

## Stage-change records

`transitionDealStage` writes deal, stage history, `STATUS_CHANGE` activity, and audit in one transaction. Repeating the current stage is a no-op and does not create another activity.

Metadata:

```json
{
  "fromStageId": "...",
  "toStageId": "...",
  "fromStageName": "Proposal",
  "toStageName": "Negotiation"
}
```

## Visibility

ADMIN and MANAGER see organization activities. MEMBER sees activities they authored or that belong to a deal/company/contact they own.

## Security

Every query is scoped by `organization_id`. Related deal/contact/company must belong to the same tenant and stay consistent with existing deal-company-contact links. Cross-tenant relations return `CROSS_TENANT_RELATION` or `INVALID_ACTIVITY_RELATION`.

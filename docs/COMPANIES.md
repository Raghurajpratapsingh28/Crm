# Companies

Every company belongs to exactly one organization. The API never trusts `organizationId` from the request body, query string, route, or frontend state. Organization is taken from the authenticated membership.

## Schema

`companies`

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `organization_id` | Required, tenant key |
| `name` | Required, trimmed |
| `industry` | Optional string |
| `employee_count` | Optional integer `>= 0` |
| `website` | Optional URL, stored with `https://` when omitted |
| `owner_id` | Active member of the same organization |
| `tags` | `text[]`, lowercased, de-duplicated |
| `notes` | Optional, max 5000 characters |
| `created_at` / `updated_at` | Server-owned |

Indexes: `organization_id`, `(organization_id, name)`, `(organization_id, owner_id)`, `(organization_id, industry)`, `(organization_id, created_at)`.

Relations ready for later modules: `contacts`, `deals`, `activities`, `tasks`.

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/companies` | `companies.read` |
| `GET` | `/api/v1/companies/duplicates?name=` | `companies.read` |
| `GET` | `/api/v1/companies/:id` | `companies.read` |
| `POST` | `/api/v1/companies` | `companies.create` |
| `PATCH` | `/api/v1/companies/:id` | `companies.update` |
| `DELETE` | `/api/v1/companies/:id` | `companies.delete` |

List query: `page`, `limit` (max 100), `search` (name / website / industry), `industry`, `owner`, `tag`, `createdFrom`, `createdTo`, `sortBy`, `sortOrder`.

Sort whitelist: `name`, `industry`, `employeeCount`, `createdAt`, `updatedAt`.

List response:

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": { "page": 1, "limit": 25, "total": 0, "totalPages": 1 }
  }
}
```

## Ownership

- `MEMBER` sees and updates only companies they own.
- `MANAGER` and `ADMIN` see the organization.
- Members cannot assign ownership to someone else. Admins/managers can assign any **ACTIVE** member of the same organization.

## Duplicates

Company names are not unique. `GET /companies/duplicates` returns similar names so the UI can warn. Creation is still allowed.

## Deletion

Delete is blocked when contacts, deals, activities, or tasks still point at the company (`COMPANY_HAS_DEPENDENCIES`). Reassign first. No cascade.

## Audit

`COMPANY_CREATED`, `COMPANY_UPDATED`, `COMPANY_DELETED`, `COMPANY_OWNER_CHANGED`.

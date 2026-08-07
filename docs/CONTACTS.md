# Contacts

Every contact belongs to exactly one organization. Organization is always taken from the authenticated membership.

Contacts may exist without a company. A company association is optional and must stay inside the same organization.

## Schema

`contacts`

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `organization_id` | Required, tenant key |
| `first_name` / `last_name` | Required |
| `email` | Optional, stored lowercase |
| `phone` | Optional, compact / E.164-style |
| `job_title` | Optional |
| `company_id` | Optional, same-org company |
| `industry` | Optional; not copied from the company |
| `source` | `REFERRAL`, `WEBSITE`, `COLD_OUTREACH`, `EVENT`, `SOCIAL`, `PARTNER`, `OTHER` |
| `owner_id` | Required, ACTIVE member of the same organization |
| `tags` | `text[]`, normalized |
| `notes` | Optional, max 5000 characters |

Unique: `(organization_id, email)` for non-null emails. Multiple contacts without email are allowed. Empty emails are stored as `NULL`.

Indexes: `organization_id + owner_id`, `company_id`, `source`, `created_at`.

## Duplicate detection

Same **normalized** email in the same organization is a duplicate.

`John@Example.com`, `john@example.com`, and ` JOHN@example.com ` are the same contact. The same email in another organization is not a duplicate.

The API returns:

```json
{
  "success": false,
  "error": {
    "code": "CONTACT_DUPLICATE",
    "message": "A contact with this email already exists."
  },
  "data": {
    "existingContactId": "..."
  }
}
```

The unique index is the concurrency guard. Application checks are not enough.

## Endpoints

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/api/v1/contacts` | `contacts.read` |
| `GET` | `/api/v1/contacts/duplicates?email=` | `contacts.read` |
| `GET` | `/api/v1/contacts/:id` | `contacts.read` |
| `POST` | `/api/v1/contacts` | `contacts.create` |
| `PATCH` | `/api/v1/contacts/:id` | `contacts.update` |
| `DELETE` | `/api/v1/contacts/:id` | `contacts.delete` |

List query: `page`, `limit` (max 100), `search` (name, email, phone, job title, company name), `owner`, `company`, `industry`, `source`, `tag`, `createdFrom`, `createdTo`, `sortBy`, `sortOrder`.

Sort whitelist: `firstName`, `lastName`, `email`, `createdAt`, `updatedAt`.

## Ownership

Same as companies: members see their own records; managers and admins see the organization. Owner changes must target an ACTIVE member of the current organization.

## Deletion

Blocked when the contact is the primary contact on a deal (`CONTACT_HAS_DEPENDENCIES`). Activities and tasks stay (their contact foreign key is `ON DELETE SET NULL`).

## Audit

`CONTACT_CREATED`, `CONTACT_UPDATED`, `CONTACT_DELETED`, `CONTACT_OWNER_CHANGED`.

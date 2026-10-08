# Global Search

Command palette search is PostgreSQL + Prisma. There is no Elasticsearch / Algolia / Typesense service in this milestone.

```text
Next.js command palette
  → GET /api/v1/search?q&type&limit
  → JWT + tenant middleware (organization_id from membership)
  → requireAnyPermission(contacts.read | companies.read | deals.read | activities.read)
  → ownerScope / activityScope
  → bounded Prisma ILIKE queries
  → rank exact → prefix → partial → recency
```

`organizationId` is never a trusted query parameter. Passing one is ignored.

## Endpoint

```http
GET /api/v1/search?q=john&type=all&limit=20
```

| Param | Rules |
|---|---|
| `q` | Required. Trimmed, collapsed whitespace, max 100 characters. `%`, `_`, and `\` are stripped so they cannot be ILIKE wildcards. |
| `type` | `all` (default), `contacts`, `companies`, `deals`, `activities`. |
| `limit` | Positive integer. Default 20. Maximum 50. Larger or non-integer values return `INVALID`. |

Tasks are not searchable.

Rate limit: 120 requests / minute / user (existing `rateLimit` middleware).

Unauthenticated → 401. No CRM read permission → 403. Validation errors → 400 `INVALID`.

## Result contract

```json
{
  "query": "john",
  "results": {
    "contacts": [{ "id": "...", "type": "contact", "title": "John Doe", "subtitle": "john@example.com", "href": "/contacts/...", "relevance": 1, "timestamp": "..." }],
    "companies": [],
    "deals": [],
    "activities": []
  },
  "total": 1
}
```

Hrefs match existing routes: `/contacts/:id`, `/companies/:id`, `/deals/:id`, `/activities/:id`. Opening a result still goes through that module’s GET authorization. Search is not a substitute for object-level checks.

Fields returned are display-only (id, type, title, subtitle, href, relevance, timestamp). Notes, tags, amounts, metadata JSON, tokens, and secrets are not selected.

## Searchable fields

| Entity | Fields | Visibility |
|---|---|---|
| Contacts | first name, last name, combined name, email, phone, job title | `ownerScope` |
| Companies | name, website, industry | `ownerScope` |
| Deals | name, company name, primary contact name/email | `ownerScope` |
| Activities | content, related names, exact activity type label (`call`, `email`, …) | `activityScope` |

ADMIN and MANAGER see organization (team) records. MEMBER sees owned contacts/companies/deals and activities they authored or that are tied to records they own. Same helpers as the CRM list endpoints.

If `type=all`, types the user cannot read are skipped. If `type` is a single entity they cannot read, the API returns 403.

## Ranking

Each candidate is scored on its searchable fields:

1. Exact match (case-insensitive)
2. Prefix match
3. Partial match
4. Recency (`updated_at`, or `occurred_at` for activities)

Lower `relevance` is better (`1` exact, `2` prefix, `3` partial).

PostgreSQL returns at most 50 newest ILIKE matches **per type**. Node ranks that bounded set and returns the global top `limit` rows, then groups them for the UI. An exact match in one category is not dropped in favor of a weaker match in another.

Limitation: a very old exact match can fall outside the 50-row window when a tenant has many newer partial matches. That is acceptable at current scale.

## Performance

- `take` is always capped (`SEARCH_MAX_LIMIT = 50`).
- Queries use Prisma `select` (no notes, metadata, or nested graphs).
- Four types run in parallel. No N+1.
- Existing btree indexes (`organization_id`, owner, created/updated) help the tenant filter. `%term%` ILIKE will not use those btrees for the text predicate.
- No result cache (results are per user, role, and query).
- Logs: route, user, organization, duration, result count, type. **Not** the search string.

No new indexes were added. Future option: `pg_trgm` GIN on name/email columns, or a dedicated search service, if tenants outgrow sequential ILIKE.

## Frontend

The authenticated shell mounts a command palette (`CommandPaletteProvider`). `/` opens it when the user is not typing. Queries are debounced 200ms and aborted when the query changes. Empty input shows Quick Actions / Navigation / Keyboard Shortcuts (permission-filtered). Results stay grouped while keyboard selection walks a flattened list and wraps at both ends.

See `docs/KEYBOARD_SHORTCUTS.md`.

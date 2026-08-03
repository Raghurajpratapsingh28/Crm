# Tenancy

Every CRM row is scoped by `organization_id`. The API never trusts an organization id from the browser.

```text
JWT
  → users.id
  → organization_members (status = ACTIVE)
  → req.tenant.organizationId / membershipId / role
  → Prisma where: { id, organizationId: req.tenant.organizationId }
```

## Rules

- One active membership is selected automatically.
- `X-Organization-ID` is only honored if it matches a membership the user already has.
- Request body fields such as `organization_id`, `user_id`, and `owner_id` cannot change the tenant or the acting user.
- Missing, invited, or deactivated memberships return `403 FORBIDDEN`.
- Cross-tenant reads of contacts, companies, and deals return `403`.

## Onboarding

```text
Authenticated user with no ACTIVE membership
  → POST /api/v1/organizations { name }
  → transaction:
        organization
        organization_members (ADMIN, ACTIVE)
        Default Sales Pipeline
        Lead … Lost stages
  → /dashboard
```

Retrying create returns the existing organization. A failed transaction leaves no organization behind.

## Role

`role` is always `organization_members.role`. ADMIN can `PATCH /api/v1/organizations/current`. MEMBER cannot.

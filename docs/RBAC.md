# RBAC

Customer organizations have three roles: `ADMIN`, `MANAGER`, `MEMBER`. There is no `SUPER_ADMIN` inside a tenant.

Permissions live in `@crm/types` (`PERMISSIONS`, `ROLE_PERMISSIONS`). The API never trusts a role or permission sent by the client.

```text
JWT → user → ACTIVE membership → role → in-memory permission set → ownership → Prisma
```

## Role → permission matrix

| Permission | ADMIN | MANAGER | MEMBER |
|---|---:|---:|---:|
| organization.read | ✓ | ✓ | ✓ |
| organization.update | ✓ | ✗ | ✗ |
| users.read | ✓ | ✓ | ✗ |
| users.invite | ✓ | ✗ | ✗ |
| users.update | ✓ | ✗ | ✗ |
| users.deactivate | ✓ | ✗ | ✗ |
| contacts.read | ✓ | ✓ | own |
| contacts.create | ✓ | ✓ | ✓ |
| contacts.update | ✓ | ✓ | own |
| contacts.delete | ✓ | ✓ | ✗ |
| companies.read | ✓ | ✓ | own |
| companies.create | ✓ | ✓ | ✓ |
| companies.update | ✓ | ✓ | own |
| companies.delete | ✓ | ✓ | ✗ |
| deals.read | ✓ | ✓ | own |
| deals.create | ✓ | ✓ | ✓ |
| deals.update | ✓ | ✓ | own |
| deals.delete | ✓ | ✓ | ✗ |
| deals.assign | ✓ | ✓ | ✗ |
| pipeline.read | ✓ | ✓ | ✓ |
| pipeline.manage | ✓ | ✗ | ✗ |
| activities.read | ✓ | ✓ | own |
| activities.create | ✓ | ✓ | ✓ |
| tasks.read | ✓ | ✓ | own |
| tasks.create | ✓ | ✓ | ✓ |
| tasks.update | ✓ | ✓ | own |
| tasks.delete | ✓ | ✓ | ✗ |
| analytics.read | ✓ | ✓ | ✗ |
| analytics.team | ✓ | ✓ | ✗ |
| notifications.read | ✓ | ✓ | own |
| billing.read | ✓ | ✗ | ✗ |
| billing.manage | ✓ | ✗ | ✗ |
| audit.read | ✓ | ✓ | ✗ |

### Decisions vs the original table

- **MANAGER has `users.read`.** The detailed MANAGER list grants it so managers can see the roster. They still cannot invite, change roles, or deactivate. The Team nav item stays ADMIN-only (`users.invite`).
- **MEMBER does not get `analytics.read`.** Personal analytics remain unused until a later product decision. Team analytics stay ADMIN/MANAGER only.

## Ownership

- ADMIN and MANAGER: organization-wide for CRM objects they can permission.
- MEMBER: `ownerId` / `assigneeId` / `authorId` must match the current user.
- Cross-tenant IDs return `404` when the actor has the verb, or `403` when they lack the permission.

## Adding a permission

1. Add it to `PERMISSIONS` in `packages/types/src/index.ts`.
2. Add it to the correct rows in `ROLE_PERMISSIONS`.
3. Guard the route with `requirePermission(PERMISSIONS.…)`.
4. Update this matrix and the tests.

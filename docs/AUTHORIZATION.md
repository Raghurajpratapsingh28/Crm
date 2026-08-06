# Authorization

## Request chain

```text
Request
  → requireAuth (Supabase JWT)
  → local user upsert
  → requireTenant (ACTIVE membership only)
  → requirePermission(...)
  → tenant-scoped load
  → ownership / visibility
  → service / Prisma
```

Controllers must not skip this chain. Frontend `can("deals.update")` is UX only.

## API helpers

```ts
requirePermission(PERMISSIONS.DEALS_UPDATE)
hasPermission(role, PERMISSIONS.DEALS_UPDATE)
assertVisibleOwned(role, userId, deal.ownerId)
ownerScope(role, userId) // {} for ADMIN/MANAGER, { ownerId } for MEMBER
```

Role checks such as `if (role === "ADMIN")` do not belong in controllers.

## Protected fields

Update bodies reject:

```text
organization_id / organizationId
owner_id / ownerId
user_id / userId
role / permissions
supabase_user_id
created_at / created_by
```

Deal assignment is a dedicated `POST /api/v1/deals/:id/assign` that requires `deals.assign` and an ACTIVE same-org target.

## Tenant isolation

Every CRM query includes `organizationId` from `req.tenant`, never from the body. A user in org A cannot read, patch, or delete org B records by ID.

## Team safety

- Prefer `status = DEACTIVATED` over deleting users.
- Historical deals/contacts/tasks stay intact.
- An organization cannot lose its last ACTIVE ADMIN.
- Users cannot change their own role or deactivate themselves.

## Audit

`audit_logs` is organization-scoped. `audit.read` is required. Sensitive actions write:

```text
USER_INVITED
USER_ROLE_CHANGED
USER_DEACTIVATED
USER_REACTIVATED
RECORD_DELETED
DEAL_ASSIGNED
PIPELINE_CHANGED
BILLING_CHANGED
ORGANIZATION_UPDATED
INVITATION_RESENT
INVITATION_CANCELLED
MEMBER_JOINED
MEMBER_DEPARTMENT_CHANGED
OWNERSHIP_TRANSFERRED
```

Role-change metadata stores actor, target, old role, and new role.

## Frontend

`GET /api/v1/auth/me` returns `role` and `permissions`.

```ts
const { can } = useAuth();
if (can(PERMISSIONS.BILLING_MANAGE)) { /* show checkout */ }
```

Nav hides Team, Billing, Settings, and team Analytics unless the matching permission exists.

## Adding a protected endpoint

```ts
router.patch(
  "/:id",
  requireAuth,
  requireTenant,
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  asyncHandler(async (req, res) => {
    const row = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: tenantId(req) },
    });
    if (!row) throw notFound();
    assertVisibleOwned(req.tenant.role, req.auth.userId, row.ownerId);
    // update allowed fields only
  }),
);
```

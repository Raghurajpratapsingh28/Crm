import { PERMISSIONS, type Role } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { writeAudit } from "../../services/audit.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, invalid, notFound, ok } from "../../utils/errors.js";

const ROLES: Role[] = ["ADMIN", "MANAGER", "MEMBER"];

export const teamRouter: Router = Router();
teamRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  if (!userId) throw forbidden();
  return { organizationId, userId };
}

async function activeAdminCount(
  organizationId: string,
  db: { organizationMember: { count: typeof prisma.organizationMember.count } } = prisma,
) {
  return db.organizationMember.count({
    where: { organizationId, role: "ADMIN", status: "ACTIVE" },
  });
}

teamRouter.get(
  "/",
  requirePermission(PERMISSIONS.USERS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(
      ok(
        members.map((row) => ({
          id: row.id,
          userId: row.userId,
          email: row.user.email,
          fullName: row.user.fullName,
          role: row.role,
          status: row.status,
        })),
      ),
    );
  }),
);

teamRouter.post(
  "/",
  requirePermission(PERMISSIONS.USERS_INVITE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const email = String((req.body as { email?: string }).email ?? "")
      .trim()
      .toLowerCase();
    const role = ((req.body as { role?: Role }).role ?? "MEMBER") as Role;
    if (!email) throw invalid("email is required");
    if (!ROLES.includes(role)) throw invalid("role is invalid");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw invalid("that user must sign up before they can be invited");

    const existing = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
    });
    if (existing) throw invalid("user already belongs to this organization");

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.organizationMember.create({
        data: {
          organizationId,
          userId: user.id,
          role,
          status: "INVITED",
          invitedById: userId,
        },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "USER_INVITED",
        entityType: "organization_members",
        entityId: created.id,
        metadata: { email, role },
      });
      return created;
    });
    res.status(201).json(ok({ id: member.id, userId: user.id, role: member.role, status: member.status }));
  }),
);

teamRouter.patch(
  "/:memberId",
  requirePermission(PERMISSIONS.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const role = (req.body as { role?: Role }).role;
    if (!role || !ROLES.includes(role)) throw invalid("role is invalid");

    const member = await prisma.organizationMember.findFirst({
      where: { id: req.params.memberId, organizationId },
    });
    if (!member) throw notFound();
    if (member.userId === userId) throw forbidden("You cannot change your own role");

    const updated = await prisma.$transaction(async (tx) => {
      if (member.role === "ADMIN" && role !== "ADMIN" && member.status === "ACTIVE") {
        const admins = await activeAdminCount(organizationId, tx);
        if (admins <= 1) throw invalid("organization must keep at least one active ADMIN");
      }
      const next = await tx.organizationMember.update({
        where: { id: member.id },
        data: { role },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "USER_ROLE_CHANGED",
        entityType: "organization_members",
        entityId: member.id,
        metadata: { targetUserId: member.userId, oldRole: member.role, newRole: role },
      });
      return next;
    });
    res.json(ok({ id: updated.id, role: updated.role, status: updated.status }));
  }),
);

teamRouter.delete(
  "/:memberId",
  requirePermission(PERMISSIONS.USERS_DEACTIVATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const member = await prisma.organizationMember.findFirst({
      where: { id: req.params.memberId, organizationId },
    });
    if (!member) throw notFound();
    if (member.userId === userId) throw forbidden("You cannot deactivate yourself");

    const updated = await prisma.$transaction(async (tx) => {
      if (member.role === "ADMIN" && member.status === "ACTIVE") {
        const admins = await activeAdminCount(organizationId, tx);
        if (admins <= 1) throw invalid("organization must keep at least one active ADMIN");
      }
      const next = await tx.organizationMember.update({
        where: { id: member.id },
        data: { status: "DEACTIVATED" },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "USER_DEACTIVATED",
        entityType: "organization_members",
        entityId: member.id,
        metadata: { targetUserId: member.userId, role: member.role },
      });
      return next;
    });
    res.json(ok({ id: updated.id, status: updated.status }));
  }),
);

teamRouter.post(
  "/:memberId/reactivate",
  requirePermission(PERMISSIONS.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const member = await prisma.organizationMember.findFirst({
      where: { id: req.params.memberId, organizationId },
    });
    if (!member) throw notFound();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.organizationMember.update({
        where: { id: member.id },
        data: { status: "ACTIVE" },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "USER_REACTIVATED",
        entityType: "organization_members",
        entityId: member.id,
        metadata: { targetUserId: member.userId },
      });
      return next;
    });
    res.json(ok({ id: updated.id, status: updated.status }));
  }),
);

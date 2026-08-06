import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../services/audit.service.js";
import { notify } from "../../services/notification.service.js";
import { conflict, forbidden, invalid, notFound } from "../../utils/errors.js";
import { activeAdminCount, parseDepartment, parseListQuery, parseRole, parseStatus } from "./team.util.js";

const memberInclude = {
  user: { select: { id: true, email: true, fullName: true, avatarUrl: true } },
} satisfies Prisma.OrganizationMemberInclude;

export function publicMember(row: {
  id: string;
  userId: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  department: "SALES" | "MARKETING" | "MANAGEMENT" | "OTHER" | null;
  status: "INVITED" | "ACTIVE" | "DEACTIVATED";
  createdAt: Date;
  user: { id: string; email: string; fullName: string; avatarUrl: string | null };
}) {
  return {
    id: row.id,
    userId: row.userId,
    email: row.user.email,
    fullName: row.user.fullName,
    avatarUrl: row.user.avatarUrl,
    role: row.role,
    department: row.department,
    status: row.status,
    createdAt: row.createdAt,
  };
}

export async function loadMember(organizationId: string, memberId: string) {
  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId },
    include: memberInclude,
  });
  if (!member) throw notFound();
  return member;
}

export async function listMembers(organizationId: string, query: Record<string, unknown>) {
  const parsed = parseListQuery(query);
  const role = query.role ? parseRole(query.role) : undefined;
  const status = parseStatus(query.status);
  const department = parseDepartment(query.department);

  const where: Prisma.OrganizationMemberWhereInput = { organizationId };
  if (role) where.role = role;
  if (status) where.status = status;
  if (department !== undefined) where.department = department;
  if (parsed.search) {
    where.OR = [
      { user: { fullName: { contains: parsed.search, mode: "insensitive" } } },
      { user: { email: { contains: parsed.search, mode: "insensitive" } } },
    ];
  }

  const direction = parsed.order === "desc" ? "desc" : "asc";
  const orderBy: Prisma.OrganizationMemberOrderByWithRelationInput =
    parsed.sort === "name"
      ? { user: { fullName: direction } }
      : parsed.sort === "email"
        ? { user: { email: direction } }
        : parsed.sort === "role"
          ? { role: direction }
          : { createdAt: direction };

  const [total, rows] = await Promise.all([
    prisma.organizationMember.count({ where }),
    prisma.organizationMember.findMany({
      where,
      include: memberInclude,
      orderBy,
      skip: parsed.skip,
      take: parsed.limit,
    }),
  ]);

  return {
    items: rows.map(publicMember),
    page: parsed.page,
    limit: parsed.limit,
    total,
  };
}

export async function getMemberDetail(organizationId: string, memberId: string) {
  const member = await loadMember(organizationId, memberId);
  const [deals, contacts, tasks, activities] = await Promise.all([
    prisma.deal.count({ where: { organizationId, ownerId: member.userId } }),
    prisma.contact.count({ where: { organizationId, ownerId: member.userId } }),
    prisma.task.count({ where: { organizationId, assigneeId: member.userId } }),
    prisma.activity.findMany({
      where: { organizationId, authorId: member.userId },
      orderBy: { occurredAt: "desc" },
      take: 10,
      select: { id: true, type: true, content: true, occurredAt: true, dealId: true },
    }),
  ]);

  return {
    ...publicMember(member),
    assigned: { deals, contacts, tasks },
    recentActivity: activities,
  };
}

export async function getMemberActivity(organizationId: string, memberId: string) {
  const member = await loadMember(organizationId, memberId);
  const [activities, audit] = await Promise.all([
    prisma.activity.findMany({
      where: { organizationId, authorId: member.userId },
      orderBy: { occurredAt: "desc" },
      take: 25,
      select: { id: true, type: true, content: true, occurredAt: true, dealId: true, contactId: true },
    }),
    prisma.auditLog.findMany({
      where: { organizationId, actorId: member.userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    }),
  ]);
  return { activities, audit };
}

export async function updateMember(
  organizationId: string,
  actorId: string,
  memberId: string,
  body: { role?: unknown; department?: unknown },
) {
  const member = await loadMember(organizationId, memberId);
  const role = body.role !== undefined ? parseRole(body.role) : undefined;
  const department = parseDepartment(body.department);

  if (role === undefined && department === undefined) {
    throw invalid("role or department is required");
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (role && member.role === "ADMIN" && role !== "ADMIN" && member.status === "ACTIVE") {
      const admins = await activeAdminCount(organizationId, tx);
      if (admins <= 1) {
        throw conflict("LAST_ADMIN_REQUIRED", "Organization must keep at least one active ADMIN");
      }
    }
    if (role && member.userId === actorId) {
      throw forbidden("You cannot change your own role");
    }

    const next = await tx.organizationMember.update({
      where: { id: member.id },
      data: {
        ...(role ? { role } : {}),
        ...(department !== undefined ? { department } : {}),
      },
      include: memberInclude,
    });

    if (role && role !== member.role) {
      await writeAudit(tx, {
        organizationId,
        actorId,
        action: "USER_ROLE_CHANGED",
        entityType: "organization_members",
        entityId: member.id,
        metadata: { targetUserId: member.userId, oldRole: member.role, newRole: role },
      });
      await notify(tx, {
        organizationId,
        userId: member.userId,
        type: "MEMBER_ROLE_CHANGED",
        payload: { oldRole: member.role, newRole: role },
      });
    }

    if (department !== undefined && department !== member.department) {
      await writeAudit(tx, {
        organizationId,
        actorId,
        action: "MEMBER_DEPARTMENT_CHANGED",
        entityType: "organization_members",
        entityId: member.id,
        metadata: { targetUserId: member.userId, oldDepartment: member.department, newDepartment: department },
      });
    }

    return next;
  });

  return publicMember(updated);
}

export async function deactivateMember(organizationId: string, actorId: string, memberId: string) {
  const member = await loadMember(organizationId, memberId);
  if (member.status === "DEACTIVATED") return publicMember(member);

  const updated = await prisma.$transaction(async (tx) => {
    if (member.role === "ADMIN" && member.status === "ACTIVE") {
      const admins = await activeAdminCount(organizationId, tx);
      if (admins <= 1) {
        throw conflict("LAST_ADMIN_REQUIRED", "Organization must keep at least one active ADMIN");
      }
    }
    if (member.userId === actorId) throw forbidden("You cannot deactivate yourself");
    const next = await tx.organizationMember.update({
      where: { id: member.id },
      data: { status: "DEACTIVATED" },
      include: memberInclude,
    });
    await writeAudit(tx, {
      organizationId,
      actorId,
      action: "USER_DEACTIVATED",
      entityType: "organization_members",
      entityId: member.id,
      metadata: { targetUserId: member.userId, role: member.role },
    });
    await notify(tx, {
      organizationId,
      userId: member.userId,
      type: "MEMBER_STATUS_CHANGED",
      payload: { status: "DEACTIVATED" },
    });
    return next;
  });

  return publicMember(updated);
}

export async function reactivateMember(organizationId: string, actorId: string, memberId: string) {
  const member = await loadMember(organizationId, memberId);
  if (member.status === "ACTIVE") return publicMember(member);

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.organizationMember.update({
      where: { id: member.id },
      data: { status: "ACTIVE" },
      include: memberInclude,
    });
    await writeAudit(tx, {
      organizationId,
      actorId,
      action: "USER_REACTIVATED",
      entityType: "organization_members",
      entityId: member.id,
      metadata: { targetUserId: member.userId },
    });
    await notify(tx, {
      organizationId,
      userId: member.userId,
      type: "MEMBER_STATUS_CHANGED",
      payload: { status: "ACTIVE" },
    });
    return next;
  });

  return publicMember(updated);
}

import { DEFAULT_PIPELINE_NAME, DEFAULT_PIPELINE_STAGES } from "@crm/types";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { writeAudit } from "../../services/audit.service.js";
import { enqueueNotification } from "../../services/notification.service.js";
import { forbidden, invalid, notFound } from "../../utils/errors.js";

const CURRENCY = /^[A-Z]{3}$/;

export async function getActiveMembership(userId: string) {
  return prisma.organizationMember.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function createOrganizationForUser(
  userId: string,
  input: { name: string; timezone?: string; currency?: string },
) {
  const name = input.name.trim();
  if (!name) {
    throw invalid("name is required");
  }
  const timezone = input.timezone?.trim() || "UTC";
  const currency = (input.currency?.trim() || "USD").toUpperCase();
  if (!CURRENCY.test(currency)) {
    throw invalid("currency must be a 3-letter ISO code");
  }

  const existing = await getActiveMembership(userId);
  if (existing) {
    return { created: false as const, organization: toCurrent(existing) };
  }

  const created = await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name, timezone, currency },
    });

    const membership = await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    await tx.pipeline.create({
      data: {
        organizationId: organization.id,
        name: DEFAULT_PIPELINE_NAME,
        isDefault: true,
        stages: {
          create: DEFAULT_PIPELINE_STAGES.map((stage) => ({
            organizationId: organization.id,
            name: stage.name,
            key: stage.key,
            order: stage.order,
            probability: stage.probability,
            isWon: stage.isWon,
            isLost: stage.isLost,
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: organization.id,
        actorId: userId,
        action: "ORGANIZATION_UPDATED",
        entityType: "organizations",
        entityId: organization.id,
        metadata: { event: "created", name } as Prisma.InputJsonValue,
      },
    });

    return { organization, membership };
  });

  return {
    created: true as const,
    organization: toCurrent({
      ...created.membership,
      organization: created.organization,
    }),
  };
}

export async function updateCurrentOrganization(
  userId: string,
  organizationId: string,
  input: { name?: string; timezone?: string; currency?: string },
) {
  const data: { name?: string; timezone?: string; currency?: string } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw invalid("name is required");
    data.name = name;
  }
  if (input.timezone !== undefined) {
    data.timezone = input.timezone.trim() || "UTC";
  }
  if (input.currency !== undefined) {
    const currency = input.currency.trim().toUpperCase();
    if (!CURRENCY.test(currency)) {
      throw invalid("currency must be a 3-letter ISO code");
    }
    data.currency = currency;
  }

  const organization = await prisma.$transaction(async (tx) => {
    const updated = await tx.organization.update({
      where: { id: organizationId },
      data,
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorId: userId,
        action: "ORGANIZATION_UPDATED",
        entityType: "organizations",
        entityId: organizationId,
        metadata: data as Prisma.InputJsonValue,
      },
    });
    return updated;
  });

  const membership = await prisma.organizationMember.findFirst({
    where: { organizationId, userId, status: "ACTIVE" },
  });
  if (!membership) {
    throw forbidden();
  }

  return toCurrent({ ...membership, organization });
}

export async function transferOwnership(organizationId: string, actorId: string, memberId: string) {
  if (!memberId) throw invalid("memberId is required");

  return prisma.$transaction(async (tx) => {
    const actor = await tx.organizationMember.findFirst({
      where: { organizationId, userId: actorId, status: "ACTIVE" },
    });
    if (!actor || actor.role !== "ADMIN") throw forbidden();

    const target = await tx.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: { user: { select: { id: true, email: true, fullName: true } } },
    });
    if (!target) throw notFound();
    if (target.status !== "ACTIVE") throw invalid("target member must be ACTIVE");
    if (target.userId === actorId) throw invalid("cannot transfer ownership to yourself");

    await tx.organizationMember.update({
      where: { id: target.id },
      data: { role: "ADMIN" },
    });
    await tx.organizationMember.update({
      where: { id: actor.id },
      data: { role: "MANAGER" },
    });

    await writeAudit(tx, {
      organizationId,
      actorId,
      action: "OWNERSHIP_TRANSFERRED",
      entityType: "organization_members",
      entityId: target.id,
      metadata: { fromUserId: actorId, toUserId: target.userId, actorRoleAfter: "MANAGER" },
    });
    await enqueueNotification(tx, {
      organizationId,
      userId: target.userId,
      type: "MEMBER_ROLE_CHANGED",
      payload: { event: "ownership_transferred", newRole: "ADMIN" },
      skipUserId: actorId,
      dedupeKey: `MEMBER_ROLE_CHANGED:${target.id}:OWNERSHIP:${actorId}`,
    });

    return {
      previousAdminId: actor.id,
      newAdminId: target.id,
      targetUserId: target.userId,
    };
  });
}

function toCurrent(row: {
  role: "ADMIN" | "MANAGER" | "MEMBER";
  status: "INVITED" | "ACTIVE" | "DEACTIVATED";
  department?: "SALES" | "MARKETING" | "MANAGEMENT" | "OTHER" | null;
  organization: {
    id: string;
    name: string;
    timezone: string;
    currency: string;
  };
}) {
  return {
    id: row.organization.id,
    name: row.organization.name,
    timezone: row.organization.timezone,
    currency: row.organization.currency,
    role: row.role,
    department: row.department ?? null,
    membershipStatus: row.status,
  };
}

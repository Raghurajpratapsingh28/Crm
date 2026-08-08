import type { Department, Prisma, Role } from "@prisma/client";
import { env } from "../../config/env.js";
import { createInvitationToken, hashInvitationToken, invitationHashesEqual } from "../../lib/invitation-token.js";
import { prisma } from "../../lib/prisma.js";
import { enqueue } from "../../lib/queue.js";
import { writeAudit } from "../../services/audit.service.js";
import { enqueueNotification } from "../../services/notification.service.js";
import { conflict, fail, notFound } from "../../utils/errors.js";
import { normalizeEmail, parseDepartment, parseRole } from "./team.util.js";

const invitationInclude = {
  organization: { select: { id: true, name: true } },
  invitedBy: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.OrganizationInvitationInclude;

export function publicInvitation(row: {
  id: string;
  email: string;
  role: Role;
  department: Department | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  lastSentAt: Date;
  sendCount: number;
  createdAt: Date;
  invitedBy: { id: string; fullName: string; email: string };
  organization: { id: string; name: string };
}) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    department: row.department,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
    cancelledAt: row.cancelledAt,
    lastSentAt: row.lastSentAt,
    sendCount: row.sendCount,
    createdAt: row.createdAt,
    invitedBy: row.invitedBy,
    organizationName: row.organization.name,
    status: invitationStatus(row),
  };
}

export function invitationStatus(row: { expiresAt: Date; acceptedAt: Date | null; cancelledAt: Date | null }) {
  if (row.acceptedAt) return "ACCEPTED" as const;
  if (row.cancelledAt) return "CANCELLED" as const;
  if (row.expiresAt.getTime() <= Date.now()) return "EXPIRED" as const;
  return "PENDING" as const;
}

function expiresAtFromNow() {
  return new Date(Date.now() + env.invitationTtlDays * 24 * 60 * 60 * 1000);
}

function acceptUrl(rawToken: string) {
  return `${env.webUrl.replace(/\/$/, "")}/invitations/${rawToken}`;
}

async function enqueueInviteEmail(
  client: Prisma.TransactionClient,
  input: {
    organizationId: string;
    organizationName: string;
    invitationId: string;
    email: string;
    role: Role;
    department: Department | null;
    inviterName: string;
    expiresAt: Date;
    rawToken: string;
  },
) {
  await enqueue(
    "email.invite",
    {
      invitationId: input.invitationId,
      organizationName: input.organizationName,
      email: input.email,
      role: input.role,
      department: input.department,
      inviterName: input.inviterName,
      expiresAt: input.expiresAt.toISOString(),
      acceptUrl: acceptUrl(input.rawToken),
    },
    { organizationId: input.organizationId, client },
  );
}

export async function createInvitation(input: {
  organizationId: string;
  actorId: string;
  email: unknown;
  role: unknown;
  department: unknown;
}) {
  const email = normalizeEmail(input.email);
  const role = parseRole(input.role, "MEMBER");
  const department = parseDepartment(input.department) ?? null;
  const token = createInvitationToken();
  const expiresAt = expiresAtFromNow();

  const existingMember = await prisma.organizationMember.findFirst({
    where: {
      organizationId: input.organizationId,
      status: { in: ["ACTIVE", "INVITED"] },
      user: { email },
    },
    include: { user: { select: { email: true } } },
  });
  if (existingMember) {
    throw conflict("MEMBER_ALREADY_EXISTS", "This user is already a member of the organization");
  }

  const pending = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId: input.organizationId,
      email,
      acceptedAt: null,
      cancelledAt: null,
    },
  });
  if (pending && pending.expiresAt.getTime() > Date.now()) {
    throw conflict("INVITATION_ALREADY_EXISTS", "A pending invitation already exists for this email");
  }

  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: input.organizationId },
    select: { name: true },
  });
  const inviter = await prisma.user.findUniqueOrThrow({
    where: { id: input.actorId },
    select: { fullName: true, email: true },
  });

  const created = await prisma.$transaction(async (tx) => {
    if (pending) {
      await tx.organizationInvitation.update({
        where: { id: pending.id },
        data: { cancelledAt: new Date() },
      });
    }

    const invitation = await tx.organizationInvitation.create({
      data: {
        organizationId: input.organizationId,
        email,
        role,
        department,
        tokenHash: token.hash,
        expiresAt,
        invitedById: input.actorId,
        lastSentAt: new Date(),
        sendCount: 1,
      },
      include: invitationInclude,
    });

    await writeAudit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "USER_INVITED",
      entityType: "organization_invitations",
      entityId: invitation.id,
      metadata: { email, role, department },
    });

    await enqueueInviteEmail(tx, {
      organizationId: input.organizationId,
      organizationName: organization.name,
      invitationId: invitation.id,
      email,
      role,
      department,
      inviterName: inviter.fullName || inviter.email,
      expiresAt,
      rawToken: token.raw,
    });

    return invitation;
  });

  return publicInvitation(created);
}

export async function listInvitations(
  organizationId: string,
  query: { status?: string; page: number; limit: number; skip: number },
) {
  const now = new Date();
  const where: Prisma.OrganizationInvitationWhereInput = { organizationId };
  switch (query.status) {
    case "pending":
      where.acceptedAt = null;
      where.cancelledAt = null;
      where.expiresAt = { gt: now };
      break;
    case "expired":
      where.acceptedAt = null;
      where.cancelledAt = null;
      where.expiresAt = { lte: now };
      break;
    case "cancelled":
      where.cancelledAt = { not: null };
      break;
    case "accepted":
      where.acceptedAt = { not: null };
      break;
    default:
      break;
  }

  const [total, rows] = await Promise.all([
    prisma.organizationInvitation.count({ where }),
    prisma.organizationInvitation.findMany({
      where,
      include: invitationInclude,
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.limit,
    }),
  ]);

  return {
    items: rows.map(publicInvitation),
    page: query.page,
    limit: query.limit,
    total,
  };
}

export async function previewInvitation(rawToken: string) {
  const invitation = await findByRawToken(rawToken);
  if (!invitation) {
    return { status: "INVALID" as const };
  }
  const status = invitationStatus(invitation);
  return {
    status: status === "PENDING" ? ("VALID" as const) : status,
    organizationName: invitation.organization.name,
    inviterName: invitation.invitedBy.fullName || invitation.invitedBy.email,
    role: invitation.role,
    department: invitation.department,
    expiresAt: invitation.expiresAt,
    email: invitation.email,
  };
}

export async function acceptInvitation(rawToken: string, actor: { userId: string; email: string }) {
  const hash = hashInvitationToken(rawToken);

  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.organizationInvitation.findUnique({
      where: { tokenHash: hash },
      include: invitationInclude,
    });
    if (!invitation || !invitationHashesEqual(invitation.tokenHash, hash)) {
      throw fail(404, "INVALID_INVITATION", "This invitation is invalid");
    }
    if (invitation.acceptedAt) {
      throw conflict("INVITATION_ALREADY_ACCEPTED", "This invitation has already been accepted");
    }
    if (invitation.cancelledAt) {
      throw fail(410, "INVITATION_CANCELLED", "This invitation was cancelled");
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw fail(410, "INVITATION_EXPIRED", "This invitation has expired");
    }
    if (invitation.email !== actor.email.trim().toLowerCase()) {
      throw fail(403, "EMAIL_MISMATCH", "Sign in with the email address this invitation was sent to");
    }

    const organization = await tx.organization.findUnique({ where: { id: invitation.organizationId } });
    if (!organization) throw notFound("Organization not found");

    const existing = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: actor.userId } },
    });
    if (existing?.status === "ACTIVE") {
      throw conflict("MEMBERSHIP_ALREADY_EXISTS", "You are already a member of this organization");
    }

    const claimed = await tx.organizationInvitation.updateMany({
      where: {
        id: invitation.id,
        acceptedAt: null,
        cancelledAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw conflict("INVITATION_ALREADY_ACCEPTED", "This invitation has already been accepted");
    }

    const membership = existing
      ? await tx.organizationMember.update({
          where: { id: existing.id },
          data: {
            role: invitation.role,
            department: invitation.department,
            status: "ACTIVE",
            invitedById: invitation.invitedById,
          },
        })
      : await tx.organizationMember.create({
          data: {
            organizationId: invitation.organizationId,
            userId: actor.userId,
            role: invitation.role,
            department: invitation.department,
            status: "ACTIVE",
            invitedById: invitation.invitedById,
          },
        });

    await writeAudit(tx, {
      organizationId: invitation.organizationId,
      actorId: actor.userId,
      action: "MEMBER_JOINED",
      entityType: "organization_members",
      entityId: membership.id,
      metadata: { invitationId: invitation.id, role: invitation.role, email: invitation.email },
    });

    await enqueueNotification(tx, {
      organizationId: invitation.organizationId,
      userId: invitation.invitedById,
      type: "TEAM_MEMBER_JOINED",
      payload: { memberId: membership.id, userId: actor.userId, email: invitation.email, role: invitation.role },
      skipUserId: actor.userId,
      dedupeKey: `TEAM_MEMBER_JOINED:${invitation.id}:${actor.userId}`,
    });

    return { membership, organizationName: invitation.organization.name };
  });

  return result;
}

export async function resendInvitation(organizationId: string, actorId: string, invitationId: string) {
  const invitation = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId },
    include: invitationInclude,
  });
  if (!invitation) throw notFound();
  if (invitation.acceptedAt) {
    throw conflict("INVITATION_ALREADY_ACCEPTED", "This invitation has already been accepted");
  }
  if (invitation.cancelledAt) {
    throw fail(410, "INVITATION_CANCELLED", "This invitation was cancelled");
  }

  const cooldownMs = env.invitationResendCooldownSeconds * 1000;
  if (Date.now() - invitation.lastSentAt.getTime() < cooldownMs) {
    throw fail(429, "RATE_LIMITED", "Wait before resending this invitation");
  }

  const token = createInvitationToken();
  const expiresAt = expiresAtFromNow();

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: {
        tokenHash: token.hash,
        expiresAt,
        lastSentAt: new Date(),
        sendCount: { increment: 1 },
      },
      include: invitationInclude,
    });
    await writeAudit(tx, {
      organizationId,
      actorId,
      action: "INVITATION_RESENT",
      entityType: "organization_invitations",
      entityId: invitation.id,
      metadata: { email: invitation.email },
    });
    await enqueueInviteEmail(tx, {
      organizationId,
      organizationName: next.organization.name,
      invitationId: next.id,
      email: next.email,
      role: next.role,
      department: next.department,
      inviterName: next.invitedBy.fullName || next.invitedBy.email,
      expiresAt,
      rawToken: token.raw,
    });
    return next;
  });

  return publicInvitation(updated);
}

export async function cancelInvitation(organizationId: string, actorId: string, invitationId: string) {
  const invitation = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId },
  });
  if (!invitation) throw notFound();
  if (invitation.acceptedAt) {
    throw conflict("INVITATION_ALREADY_ACCEPTED", "This invitation has already been accepted");
  }
  if (invitation.cancelledAt) {
    return publicInvitation(
      await prisma.organizationInvitation.findFirstOrThrow({
        where: { id: invitation.id },
        include: invitationInclude,
      }),
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { cancelledAt: new Date() },
      include: invitationInclude,
    });
    await writeAudit(tx, {
      organizationId,
      actorId,
      action: "INVITATION_CANCELLED",
      entityType: "organization_invitations",
      entityId: invitation.id,
      metadata: { email: invitation.email },
    });
    return next;
  });

  return publicInvitation(updated);
}

async function findByRawToken(rawToken: string) {
  if (!rawToken || rawToken.length < 16) return null;
  const hash = hashInvitationToken(rawToken);
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hash },
    include: invitationInclude,
  });
  if (!invitation || !invitationHashesEqual(invitation.tokenHash, hash)) return null;
  return invitation;
}

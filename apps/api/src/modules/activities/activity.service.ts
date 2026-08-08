import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  ACTIVITY_SORT,
  activitySearchWhere,
  parseActivityContent,
  parseActivityFilters,
  parseActivityMetadata,
  parseActivityType,
  parseOccurredAt,
} from "../../lib/activity-task.js";
import { paginationMeta, parsePagination, parseSortOrder, whitelistSort } from "../../lib/crm.js";
import { assertCompatibleRelations, loadCrmRelations } from "../../lib/crm-relations.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { writeAudit } from "../../services/audit.service.js";
import { activityScope } from "../../services/authorization.service.js";
import { fail, forbidden } from "../../utils/errors.js";
import { createTaskInTx } from "../tasks/task.service.js";

type Actor = { organizationId: string; userId: string; role: Role };

const DETAIL_INCLUDE = {
  author: { select: { id: true, fullName: true, email: true } },
  deal: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.ActivityInclude;

function mapActivity(row: Prisma.ActivityGetPayload<{ include: typeof DETAIL_INCLUDE }>) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    type: row.type,
    content: row.content,
    occurredAt: row.occurredAt,
    metadata: row.metadata,
    dealId: row.dealId,
    contactId: row.contactId,
    companyId: row.companyId,
    authorId: row.authorId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.author,
    deal: row.deal,
    contact: row.contact,
    company: row.company,
  };
}

async function assertRelations(organizationId: string, ids: { dealId?: string | null; contactId?: string | null; companyId?: string | null }) {
  if (!ids.dealId && !ids.contactId && !ids.companyId) {
    throw fail(400, "INVALID_ACTIVITY_RELATION", "activity must be linked to a deal, contact, or company");
  }
  const relations = await loadCrmRelations(organizationId, ids);
  assertCompatibleRelations(relations, "INVALID_ACTIVITY_RELATION");
  return relations;
}

export async function listActivities(actor: Actor, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const sortBy = whitelistSort(query.sortBy ?? query.sort, ACTIVITY_SORT, "occurredAt");
  const sortOrder = parseSortOrder(query.sortOrder ?? query.order ?? "desc");
  const filters = parseActivityFilters(query);

  const where: Prisma.ActivityWhereInput = {
    organizationId: actor.organizationId,
    ...activityScope(actor.role, actor.userId),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.dealId ? { dealId: filters.dealId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.authorId ? { authorId: filters.authorId } : {}),
    ...(filters.occurredFrom || filters.occurredTo
      ? {
          occurredAt: {
            ...(filters.occurredFrom ? { gte: filters.occurredFrom } : {}),
            ...(filters.occurredTo ? { lte: filters.occurredTo } : {}),
          },
        }
      : {}),
    ...(filters.search ? { OR: activitySearchWhere(filters.search) } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.activity.count({ where }),
    prisma.activity.findMany({
      where,
      include: DETAIL_INCLUDE,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
  ]);

  return { items: items.map(mapActivity), pagination: paginationMeta(page, limit, total) };
}

export async function getActivity(actor: Actor, id: string) {
  const activity = await prisma.activity.findFirst({
    where: { ...scopedWhere(actor.organizationId, { id }), ...activityScope(actor.role, actor.userId) },
    include: DETAIL_INCLUDE,
  });
  if (!activity) throw fail(404, "ACTIVITY_NOT_FOUND", "Activity not found");
  return mapActivity(activity);
}

export async function createActivity(actor: Actor, body: Record<string, unknown>) {
  const type = parseActivityType(body.type);
  const content = parseActivityContent(type, body.content);
  const dealId = body.dealId ? String(body.dealId) : null;
  const contactId = body.contactId ? String(body.contactId) : null;
  const companyId = body.companyId ? String(body.companyId) : null;
  await assertRelations(actor.organizationId, { dealId, contactId, companyId });

  const followUp = body.followUp && typeof body.followUp === "object" ? (body.followUp as Record<string, unknown>) : null;
  const wantsFollowUp = Boolean(followUp && (followUp.title || followUp.create));

  const created = await prisma.$transaction(async (tx) => {
    const activity = await tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        type,
        authorId: actor.userId,
        content,
        occurredAt: parseOccurredAt(body.occurredAt),
        metadata: parseActivityMetadata(type, body.metadata) ?? {},
        dealId,
        contactId,
        companyId,
      },
      include: DETAIL_INCLUDE,
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "ACTIVITY_CREATED",
      entityType: "activities",
      entityId: activity.id,
      metadata: { type, dealId, contactId, companyId },
    });
    const followUpTask = wantsFollowUp
      ? await createTaskInTx(
          tx,
          actor,
          {
            title: followUp!.title || `Follow up: ${content ?? type}`,
            description: followUp!.description,
            dueDate: followUp!.dueDate,
            assigneeId: followUp!.assigneeId,
          },
          { dealId, contactId, companyId },
        )
      : null;
    return { activity, followUpTask };
  });

  return { ...mapActivity(created.activity), followUpTask: created.followUpTask };
}

export async function updateActivity(actor: Actor, id: string, body: Record<string, unknown>) {
  const existing = await prisma.activity.findFirst({
    where: { ...scopedWhere(actor.organizationId, { id }), ...activityScope(actor.role, actor.userId) },
  });
  if (!existing) throw fail(404, "ACTIVITY_NOT_FOUND", "Activity not found");
  if (existing.type === "STATUS_CHANGE") throw forbidden("System stage-change activities cannot be edited");
  if (actor.role === "MEMBER" && existing.authorId !== actor.userId) throw fail(404, "ACTIVITY_NOT_FOUND", "Activity not found");

  const updated = await prisma.$transaction(async (tx) => {
    const activity = await tx.activity.update({
      where: { id: existing.id },
      data: {
        ...(body.content !== undefined ? { content: parseActivityContent(existing.type, body.content) } : {}),
        ...(body.occurredAt !== undefined ? { occurredAt: parseOccurredAt(body.occurredAt) } : {}),
        ...(body.metadata !== undefined ? { metadata: parseActivityMetadata(existing.type, body.metadata) } : {}),
      },
      include: DETAIL_INCLUDE,
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "ACTIVITY_UPDATED",
      entityType: "activities",
      entityId: activity.id,
    });
    return activity;
  });
  return mapActivity(updated);
}

export async function deleteActivity(actor: Actor, id: string) {
  const existing = await prisma.activity.findFirst({
    where: { ...scopedWhere(actor.organizationId, { id }), ...activityScope(actor.role, actor.userId) },
  });
  if (!existing) throw fail(404, "ACTIVITY_NOT_FOUND", "Activity not found");
  if (existing.type === "STATUS_CHANGE") throw forbidden("System stage-change activities cannot be deleted");

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "ACTIVITY_DELETED",
      entityType: "activities",
      entityId: existing.id,
      metadata: { type: existing.type },
    });
    await tx.activity.delete({ where: { id: existing.id } });
  });
  return { id: existing.id };
}

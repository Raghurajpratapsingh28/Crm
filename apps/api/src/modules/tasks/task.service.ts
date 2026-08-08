import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  isTaskOverdue,
  parseDueDate,
  parseTaskFilters,
  parseTaskTitle,
  TASK_SORT,
  taskSearchWhere,
} from "../../lib/activity-task.js";
import { normalizeNotes, paginationMeta, parsePagination, parseSortOrder, resolveAssigneeId, whitelistSort } from "../../lib/crm.js";
import { assertCompatibleRelations, loadCrmRelations } from "../../lib/crm-relations.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { writeAudit } from "../../services/audit.service.js";
import { enqueueNotification } from "../../services/notification.service.js";
import { canAssignResource, taskScope } from "../../services/authorization.service.js";
import { fail, forbidden } from "../../utils/errors.js";

type Actor = { organizationId: string; userId: string; role: Role };

const DETAIL_INCLUDE = {
  assignee: { select: { id: true, fullName: true, email: true } },
  creator: { select: { id: true, fullName: true } },
  deal: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  company: { select: { id: true, name: true } },
} satisfies Prisma.TaskInclude;

function mapTask(row: Prisma.TaskGetPayload<{ include: typeof DETAIL_INCLUDE }>, now = new Date()) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    description: row.description,
    status: row.status,
    dueDate: row.dueDate,
    completedAt: row.completedAt,
    isOverdue: isTaskOverdue(row.status, row.dueDate, now),
    assigneeId: row.assigneeId,
    createdById: row.createdById,
    dealId: row.dealId,
    contactId: row.contactId,
    companyId: row.companyId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assignee: row.assignee,
    creator: row.creator,
    deal: row.deal,
    contact: row.contact,
    company: row.company,
  };
}

async function assertRelations(organizationId: string, ids: { dealId?: string | null; contactId?: string | null; companyId?: string | null }) {
  const relations = await loadCrmRelations(organizationId, ids);
  assertCompatibleRelations(relations, "INVALID_TASK_RELATION");
  return relations;
}

async function loadVisibleTask(actor: Actor, id: string) {
  const task = await prisma.task.findFirst({
    where: { ...scopedWhere(actor.organizationId, { id }), ...taskScope(actor.role, actor.userId) },
    include: DETAIL_INCLUDE,
  });
  if (!task) throw fail(404, "TASK_NOT_FOUND", "Task not found");
  return task;
}

export async function listTasks(actor: Actor, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const sortBy = whitelistSort(query.sortBy ?? query.sort, TASK_SORT, "dueDate");
  const sortOrder = parseSortOrder(query.sortOrder ?? query.order ?? "asc");
  const filters = parseTaskFilters(query);
  const now = new Date();

  const where: Prisma.TaskWhereInput = {
    organizationId: actor.organizationId,
    ...taskScope(actor.role, actor.userId),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.dealId ? { dealId: filters.dealId } : {}),
    ...(filters.contactId ? { contactId: filters.contactId } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.dueDateFrom || filters.dueDateTo
      ? {
          dueDate: {
            ...(filters.dueDateFrom ? { gte: filters.dueDateFrom } : {}),
            ...(filters.dueDateTo ? { lte: filters.dueDateTo } : {}),
          },
        }
      : {}),
    ...(filters.overdue ? { status: "OPEN", dueDate: { lt: now } } : {}),
    ...(filters.search ? { OR: taskSearchWhere(filters.search) } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.task.count({ where }),
    prisma.task.findMany({
      where,
      include: DETAIL_INCLUDE,
      orderBy: [{ [sortBy]: sortOrder }, { createdAt: "desc" }],
      skip,
      take: limit,
    }),
  ]);

  return { items: items.map((row) => mapTask(row, now)), pagination: paginationMeta(page, limit, total) };
}

export async function getTask(actor: Actor, id: string) {
  return mapTask(await loadVisibleTask(actor, id));
}

export async function createTaskInTx(
  tx: Prisma.TransactionClient,
  actor: Actor,
  body: Record<string, unknown>,
  relations?: { dealId: string | null; contactId: string | null; companyId: string | null },
) {
  const title = parseTaskTitle(body.title);
  const dealId = relations?.dealId ?? (body.dealId ? String(body.dealId) : null);
  const contactId = relations?.contactId ?? (body.contactId ? String(body.contactId) : null);
  const companyId = relations?.companyId ?? (body.companyId ? String(body.companyId) : null);
  if (!relations) await assertRelations(actor.organizationId, { dealId, contactId, companyId });

  const assigneeId = await resolveAssigneeId({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    role: actor.role,
    requestedAssigneeId: body.assigneeId as string | undefined,
  });

  const task = await tx.task.create({
    data: {
      organizationId: actor.organizationId,
      title,
      description: normalizeNotes(body.description) ?? null,
      dueDate: parseDueDate(body.dueDate) ?? null,
      assigneeId,
      createdById: actor.userId,
      dealId,
      contactId,
      companyId,
    },
    include: DETAIL_INCLUDE,
  });
  await writeAudit(tx, {
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: "TASK_CREATED",
    entityType: "tasks",
    entityId: task.id,
    metadata: { title, assigneeId },
  });
  if (assigneeId !== actor.userId) {
    await enqueueNotification(tx, {
      organizationId: actor.organizationId,
      userId: assigneeId,
      type: "TASK_ASSIGNED",
      payload: { taskId: task.id, title: task.title },
      skipUserId: actor.userId,
      dedupeKey: `TASK_ASSIGNED:${task.id}:${actor.userId}:${assigneeId}`,
    });
  }
  return mapTask(task);
}

export async function createTask(actor: Actor, body: Record<string, unknown>) {
  return prisma.$transaction((tx) => createTaskInTx(tx, actor, body));
}

export async function updateTask(actor: Actor, id: string, body: Record<string, unknown>) {
  const existing = await loadVisibleTask(actor, id);
  const dealId = body.dealId !== undefined ? (body.dealId ? String(body.dealId) : null) : existing.dealId;
  const contactId = body.contactId !== undefined ? (body.contactId ? String(body.contactId) : null) : existing.contactId;
  const companyId = body.companyId !== undefined ? (body.companyId ? String(body.companyId) : null) : existing.companyId;
  if (body.dealId !== undefined || body.contactId !== undefined || body.companyId !== undefined) {
    await assertRelations(actor.organizationId, { dealId, contactId, companyId });
  }

  let assigneeId = existing.assigneeId;
  if (body.assigneeId !== undefined) {
    assigneeId = await resolveAssigneeId({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      role: actor.role,
      requestedAssigneeId: String(body.assigneeId),
    });
    if (assigneeId !== existing.assigneeId && !canAssignResource(actor.role) && assigneeId !== actor.userId) {
      throw forbidden();
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const task = await tx.task.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: parseTaskTitle(body.title) } : {}),
        ...(body.description !== undefined ? { description: normalizeNotes(body.description) ?? null } : {}),
        ...(body.dueDate !== undefined ? { dueDate: parseDueDate(body.dueDate) } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId } : {}),
        ...(body.dealId !== undefined ? { dealId } : {}),
        ...(body.contactId !== undefined ? { contactId } : {}),
        ...(body.companyId !== undefined ? { companyId } : {}),
      },
      include: DETAIL_INCLUDE,
    });
    if (body.assigneeId !== undefined && assigneeId !== existing.assigneeId) {
      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "TASK_ASSIGNED",
        entityType: "tasks",
        entityId: task.id,
        metadata: { fromAssigneeId: existing.assigneeId, toAssigneeId: assigneeId },
      });
      await enqueueNotification(tx, {
        organizationId: actor.organizationId,
        userId: assigneeId,
        type: "TASK_ASSIGNED",
        payload: { taskId: task.id, title: task.title },
        skipUserId: actor.userId,
        dedupeKey: `TASK_ASSIGNED:${task.id}:${existing.assigneeId}:${assigneeId}`,
      });
    } else {
      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "TASK_UPDATED",
        entityType: "tasks",
        entityId: task.id,
        metadata: { title: task.title },
      });
    }
    return task;
  });
  return mapTask(updated);
}

export async function deleteTask(actor: Actor, id: string) {
  const existing = await loadVisibleTask(actor, id);
  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "TASK_DELETED",
      entityType: "tasks",
      entityId: existing.id,
      metadata: { title: existing.title },
    });
    await tx.task.delete({ where: { id: existing.id } });
  });
  return { id: existing.id };
}

export async function completeTask(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}::uuid FOR UPDATE`;
    const existing = await tx.task.findFirst({
      where: { ...scopedWhere(actor.organizationId, { id }), ...taskScope(actor.role, actor.userId) },
      include: DETAIL_INCLUDE,
    });
    if (!existing) throw fail(404, "TASK_NOT_FOUND", "Task not found");
    if (existing.status === "DONE") return mapTask(existing);
    const task = await tx.task.update({
      where: { id: existing.id },
      data: { status: "DONE", completedAt: new Date() },
      include: DETAIL_INCLUDE,
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "TASK_COMPLETED",
      entityType: "tasks",
      entityId: task.id,
      metadata: { title: task.title },
    });
    return mapTask(task);
  });
}

export async function reopenTask(actor: Actor, id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM tasks WHERE id = ${id}::uuid AND organization_id = ${actor.organizationId}::uuid FOR UPDATE`;
    const existing = await tx.task.findFirst({
      where: { ...scopedWhere(actor.organizationId, { id }), ...taskScope(actor.role, actor.userId) },
      include: DETAIL_INCLUDE,
    });
    if (!existing) throw fail(404, "TASK_NOT_FOUND", "Task not found");
    if (existing.status === "OPEN") return mapTask(existing);
    const task = await tx.task.update({
      where: { id: existing.id },
      data: { status: "OPEN", completedAt: null },
      include: DETAIL_INCLUDE,
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "TASK_REOPENED",
      entityType: "tasks",
      entityId: task.id,
      metadata: { title: task.title, dueDate: task.dueDate },
    });
    return mapTask(task);
  });
}

export async function assignTask(actor: Actor, id: string, assigneeId: string) {
  if (!canAssignResource(actor.role)) throw forbidden();
  return updateTask(actor, id, { assigneeId });
}

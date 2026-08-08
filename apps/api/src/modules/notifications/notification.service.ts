import { NotificationType, type Prisma } from "@prisma/client";
import { paginationMeta, parsePagination } from "../../lib/crm.js";
import { notificationHref } from "../../lib/notification-copy.js";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { invalid, notFound } from "../../utils/errors.js";

type Actor = { organizationId: string; userId: string };

const NOTIFICATION_TYPES = new Set<string>(Object.values(NotificationType));

function parseTypeFilter(value: string): NotificationType | undefined {
  if (!value) return undefined;
  if (!NOTIFICATION_TYPES.has(value)) throw invalid("type is invalid");
  return value as NotificationType;
}

function mapNotification(row: {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Prisma.JsonValue;
  readAt: Date | null;
  createdAt: Date;
}) {
  const payload = (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload
    : {}) as { taskId?: string; dealId?: string; companyId?: string; contactId?: string; title?: string; name?: string };
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    entityType: row.entityType,
    entityId: row.entityId,
    payload,
    readAt: row.readAt,
    createdAt: row.createdAt,
    href: notificationHref({ entityType: row.entityType, entityId: row.entityId, payload }),
  };
}

export async function listNotifications(actor: Actor, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const unread = String(query.unread ?? "") === "true" || String(query.unread ?? "") === "1";
  const type = parseTypeFilter(String(query.type ?? "").trim().toUpperCase());
  const where: Prisma.NotificationWhereInput = {
    organizationId: actor.organizationId,
    userId: actor.userId,
    ...(unread ? { readAt: null } : {}),
    ...(type ? { type } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);
  return { items: items.map(mapNotification), pagination: paginationMeta(page, limit, total) };
}

export async function getNotification(actor: Actor, id: string) {
  const row = await prisma.notification.findFirst({
    where: scopedWhere(actor.organizationId, { id, userId: actor.userId }),
  });
  if (!row) throw notFound();
  return mapNotification(row);
}

export async function unreadCount(actor: Actor) {
  const count = await prisma.notification.count({
    where: { organizationId: actor.organizationId, userId: actor.userId, readAt: null },
  });
  return { count };
}

export async function markRead(actor: Actor, id: string) {
  const row = await prisma.notification.findFirst({
    where: scopedWhere(actor.organizationId, { id, userId: actor.userId }),
  });
  if (!row) throw notFound();
  if (row.readAt) return mapNotification(row);
  const updated = await prisma.notification.update({
    where: { id: row.id },
    data: { readAt: new Date() },
  });
  return mapNotification(updated);
}

export async function markAllRead(actor: Actor) {
  const result = await prisma.notification.updateMany({
    where: { organizationId: actor.organizationId, userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

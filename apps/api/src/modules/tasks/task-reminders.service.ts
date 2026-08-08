import type { NotificationType, Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { overdueDedupeKey, reminderDedupeKey } from "../../lib/activity-task.js";
import { isUniqueConstraint } from "../../lib/crm.js";
import { notificationContent } from "../../lib/notification-copy.js";
import { prisma } from "../../lib/prisma.js";

async function createOnce(input: {
  organizationId: string;
  userId: string;
  type: NotificationType;
  payload: Prisma.InputJsonValue;
  dedupeKey: string;
}) {
  try {
    const copy = notificationContent(input.type, input.payload as Record<string, unknown>);
    await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        type: input.type,
        title: copy.title,
        message: copy.message,
        entityType: copy.entityType,
        entityId: copy.entityId,
        payload: input.payload,
        dedupeKey: input.dedupeKey,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraint(error)) return false;
    throw error;
  }
}

export async function sweepTaskReminders(now = new Date(), hours = env.taskReminderHours) {
  const reminderUntil = new Date(now.getTime() + hours * 60 * 60 * 1000);
  const [upcoming, overdue] = await Promise.all([
    prisma.task.findMany({
      where: {
        status: "OPEN",
        dueDate: { gt: now, lte: reminderUntil },
      },
      select: { id: true, organizationId: true, assigneeId: true, title: true, dueDate: true },
    }),
    prisma.task.findMany({
      where: {
        status: "OPEN",
        dueDate: { lt: now },
      },
      select: { id: true, organizationId: true, assigneeId: true, title: true, dueDate: true },
    }),
  ]);

  let reminders = 0;
  let overdues = 0;
  for (const task of upcoming) {
    if (!task.dueDate) continue;
    const created = await createOnce({
      organizationId: task.organizationId,
      userId: task.assigneeId,
      type: "TASK_REMINDER",
      payload: { taskId: task.id, title: task.title, dueDate: task.dueDate.toISOString() },
      dedupeKey: reminderDedupeKey(task.id, task.dueDate),
    });
    if (created) reminders += 1;
  }
  for (const task of overdue) {
    const created = await createOnce({
      organizationId: task.organizationId,
      userId: task.assigneeId,
      type: "FOLLOW_UP_OVERDUE",
      payload: { taskId: task.id, title: task.title, dueDate: task.dueDate?.toISOString() ?? null },
      dedupeKey: overdueDedupeKey(task.id, now),
    });
    if (created) overdues += 1;
  }
  return { reminders, overdues, upcoming: upcoming.length, overdue: overdue.length };
}

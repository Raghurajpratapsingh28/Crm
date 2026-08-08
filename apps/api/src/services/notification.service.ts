import type { NotificationType, Prisma } from "@prisma/client";
import { notificationContent } from "../lib/notification-copy.js";
import { enqueue } from "../lib/queue.js";
import { prisma } from "../lib/prisma.js";

type JobClient = Pick<typeof prisma, "job"> | Prisma.TransactionClient;

export async function enqueueNotification(
  client: JobClient,
  input: {
    organizationId: string;
    userId: string;
    type: NotificationType;
    payload: Record<string, unknown>;
    skipUserId?: string;
    dedupeKey?: string;
  },
) {
  if (input.skipUserId && input.userId === input.skipUserId) return null;
  const copy = notificationContent(input.type, input.payload);
  const dedupeKey = input.dedupeKey ?? `${input.type}:${input.userId}:${JSON.stringify(input.payload)}`.slice(0, 200);
  return enqueue(
    "notification.fanout",
    {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      payload: input.payload,
      dedupeKey,
      title: copy.title,
      message: copy.message,
      entityType: copy.entityType,
      entityId: copy.entityId,
    } as Prisma.InputJsonValue,
    { organizationId: input.organizationId, client },
  );
}

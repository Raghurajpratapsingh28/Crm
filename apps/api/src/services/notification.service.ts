import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { enqueue } from "../lib/queue.js";

type NotificationClient = Pick<typeof prisma, "notification"> | Prisma.TransactionClient;
type JobClient = Pick<typeof prisma, "job"> | Prisma.TransactionClient;

export async function notify(
  client: NotificationClient,
  input: {
    organizationId: string;
    userId: string;
    type: NotificationType;
    payload: Prisma.InputJsonValue;
  },
) {
  return client.notification.create({
    data: {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      payload: input.payload,
    },
  });
}

/** Enqueue in-app notification work so the HTTP request is not blocked on fan-out. */
export async function enqueueNotification(
  client: JobClient,
  input: {
    organizationId: string;
    userId: string;
    type: NotificationType;
    payload: Prisma.InputJsonValue;
    skipUserId?: string;
  },
) {
  if (input.skipUserId && input.userId === input.skipUserId) return null;
  return enqueue(
    "notification.fanout",
    {
      organizationId: input.organizationId,
      userId: input.userId,
      type: input.type,
      payload: input.payload,
    },
    { organizationId: input.organizationId, client },
  );
}

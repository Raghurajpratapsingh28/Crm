import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type NotificationClient = Pick<typeof prisma, "notification"> | Prisma.TransactionClient;

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

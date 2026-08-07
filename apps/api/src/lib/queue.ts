import type { Prisma } from "@prisma/client";
import type { JobType } from "@crm/types";
import { prisma } from "./prisma.js";

type JobClient = Pick<typeof prisma, "job"> | Prisma.TransactionClient;

export async function enqueue(
  type: JobType,
  payload: Prisma.InputJsonValue,
  options: { organizationId?: string; availableAt?: Date; client?: JobClient } = {},
) {
  const client = options.client ?? prisma;
  return client.job.create({
    data: {
      type,
      payload,
      organizationId: options.organizationId,
      availableAt: options.availableAt ?? new Date(),
    },
  });
}

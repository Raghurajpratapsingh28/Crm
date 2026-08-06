import type { Prisma } from "@prisma/client";
import type { JobType } from "@crm/types";
import { prisma } from "./prisma.js";

export async function enqueue(
  type: JobType,
  payload: Prisma.InputJsonValue,
  options: { organizationId?: string; availableAt?: Date } = {},
) {
  return prisma.job.create({
    data: {
      type,
      payload,
      organizationId: options.organizationId,
      availableAt: options.availableAt ?? new Date(),
    },
  });
}

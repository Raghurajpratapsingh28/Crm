import type { Prisma } from "@prisma/client";
import type { JobType } from "@crm/types";
import { prisma } from "./prisma.js";

export async function enqueue(
  type: JobType,
  payload: Prisma.InputJsonValue,
  availableAt = new Date(),
) {
  return prisma.job.create({
    data: { type, payload, availableAt },
  });
}

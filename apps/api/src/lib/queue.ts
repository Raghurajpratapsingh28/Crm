import type { Prisma } from "@prisma/client";
import type { JobType } from "@crm/types";
import { prisma } from "./prisma.js";
import { currentRequestId } from "./request-context.js";

type JobClient = Pick<typeof prisma, "job"> | Prisma.TransactionClient;

export const DEFAULT_JOB_MAX_ATTEMPTS = 5;

export async function enqueue(
  type: JobType,
  payload: Prisma.InputJsonValue,
  options: {
    organizationId?: string;
    availableAt?: Date;
    maxAttempts?: number;
    requestId?: string;
    client?: JobClient;
  } = {},
) {
  const client = options.client ?? prisma;
  const body = payload && typeof payload === "object" && !Array.isArray(payload)
    ? { version: 1, ...(payload as Record<string, unknown>) }
    : { version: 1, value: payload };
  return client.job.create({
    data: {
      type,
      payload: body as Prisma.InputJsonValue,
      organizationId: options.organizationId,
      availableAt: options.availableAt ?? new Date(),
      maxAttempts: options.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS,
      requestId: options.requestId ?? currentRequestId(),
    },
  });
}

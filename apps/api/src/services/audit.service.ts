import type { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

type AuditClient = Pick<typeof prisma, "auditLog"> | Prisma.TransactionClient;

export async function writeAudit(
  client: AuditClient,
  input: {
    organizationId: string;
    actorId?: string | null;
    action: AuditAction;
    entityType: string;
    entityId: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return client.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorId: input.actorId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata,
    },
  });
}

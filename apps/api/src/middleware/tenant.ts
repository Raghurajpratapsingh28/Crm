import type { Role } from "@crm/types";
import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { forbidden } from "../utils/errors.js";
import type { AuthedRequest } from "./auth.js";

export interface TenantContext {
  organizationId: string;
  membershipId: string;
  role: Role;
}

export interface TenantRequest extends AuthedRequest {
  tenant?: TenantContext;
  organizationId?: string;
  role?: Role;
}

export async function requireTenant(req: TenantRequest, _res: Response, next: NextFunction) {
  try {
    await attachTenant(req, next);
  } catch (err) {
    next(err);
  }
}

async function attachTenant(req: TenantRequest, next: NextFunction) {
  const userId = req.auth?.userId ?? req.userId;
  if (!userId) {
    next(forbidden("You do not have access to this organization"));
    return;
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    next(forbidden("You do not have access to this organization"));
    return;
  }

  const hinted = req.header("x-organization-id")?.trim();
  const membership = hinted
    ? memberships.find((row) => row.organizationId === hinted)
    : memberships[0];

  if (!membership) {
    next(forbidden("You do not have access to this organization"));
    return;
  }

  req.tenant = {
    organizationId: membership.organizationId,
    membershipId: membership.id,
    role: membership.role,
  };
  req.organizationId = membership.organizationId;
  req.role = membership.role;
  next();
}

export function tenantId(req: TenantRequest) {
  const id = req.tenant?.organizationId;
  if (!id) {
    throw forbidden("You do not have access to this organization");
  }
  return id;
}

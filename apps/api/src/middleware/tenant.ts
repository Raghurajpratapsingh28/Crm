import type { Role } from "@crm/types";
import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/errors.js";
import type { AuthedRequest } from "./auth.js";

export interface TenantRequest extends AuthedRequest {
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
  if (!req.userId) {
    next(
      new AppError(
        409,
        "user_not_provisioned",
        "No local user for this Supabase account. Complete onboarding first.",
      ),
    );
    return;
  }

  const headerOrg = req.header("x-organization-id");
  const membership = await prisma.organizationMember.findFirst({
    where: {
      userId: req.userId,
      status: "ACTIVE",
      ...(headerOrg ? { organizationId: headerOrg } : {}),
    },
    orderBy: { organizationId: "asc" },
  });

  if (!membership) {
    next(new AppError(403, "forbidden", "No active organization membership"));
    return;
  }

  req.organizationId = membership.organizationId;
  req.role = membership.role;
  next();
}

import type { NextFunction, Response } from "express";
import type { Role } from "@crm/types";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest } from "./auth.js";

export interface TenantRequest extends AuthedRequest {
  organizationId?: string;
  role?: Role;
}

export async function requireTenant(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.userId) {
    res.status(409).json({
      error: "user_not_provisioned",
      message: "No local user for this Supabase account. Complete onboarding first.",
    });
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
    res.status(403).json({ error: "forbidden", message: "No active organization membership" });
    return;
  }

  req.organizationId = membership.organizationId;
  req.role = membership.role;
  next();
}

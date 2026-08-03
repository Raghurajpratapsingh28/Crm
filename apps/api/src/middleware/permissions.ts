import type { Role } from "@crm/types";
import type { NextFunction, Response } from "express";
import { forbidden } from "../utils/errors.js";
import type { TenantRequest } from "./tenant.js";

const rank: Record<Role, number> = {
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export function requireRole(...allowed: Role[]) {
  return (req: TenantRequest, _res: Response, next: NextFunction) => {
    const role = req.tenant?.role ?? req.role;
    if (!role || !allowed.includes(role)) {
      next(forbidden("Insufficient role"));
      return;
    }
    next();
  };
}

export function atLeast(min: Role) {
  return (req: TenantRequest, _res: Response, next: NextFunction) => {
    const role = req.tenant?.role ?? req.role;
    if (!role || rank[role] < rank[min]) {
      next(forbidden("Insufficient role"));
      return;
    }
    next();
  };
}

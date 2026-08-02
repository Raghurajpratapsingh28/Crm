import type { Role } from "@crm/types";
import type { NextFunction, Response } from "express";
import { AppError } from "../utils/errors.js";
import type { TenantRequest } from "./tenant.js";

const rank: Record<Role, number> = {
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export function requireRole(...allowed: Role[]) {
  return (req: TenantRequest, _res: Response, next: NextFunction) => {
    if (!req.role || !allowed.includes(req.role)) {
      next(new AppError(403, "forbidden", "Insufficient role"));
      return;
    }
    next();
  };
}

export function atLeast(min: Role) {
  return (req: TenantRequest, _res: Response, next: NextFunction) => {
    if (!req.role || rank[req.role] < rank[min]) {
      next(new AppError(403, "forbidden", "Insufficient role"));
      return;
    }
    next();
  };
}

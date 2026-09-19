import type { NextFunction, Response } from "express";
import type { Role } from "@crm/types";
import type { TenantRequest } from "./tenant.js";

const rank: Record<Role, number> = {
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
};

export function requireRole(...allowed: Role[]) {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    if (!req.role || !allowed.includes(req.role)) {
      res.status(403).json({ error: "forbidden", message: "Insufficient role" });
      return;
    }
    next();
  };
}

export function atLeast(min: Role) {
  return (req: TenantRequest, res: Response, next: NextFunction) => {
    if (!req.role || rank[req.role] < rank[min]) {
      res.status(403).json({ error: "forbidden", message: "Insufficient role" });
      return;
    }
    next();
  };
}

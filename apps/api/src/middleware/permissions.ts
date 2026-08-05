import type { Permission } from "@crm/types";
import type { NextFunction, Response } from "express";
import { hasPermission } from "../services/permission.service.js";
import { forbidden } from "../utils/errors.js";
import type { TenantRequest } from "./tenant.js";

export function requirePermission(permission: Permission) {
  return (req: TenantRequest, _res: Response, next: NextFunction) => {
    const role = req.tenant?.role ?? req.role;
    if (!hasPermission(role, permission)) {
      next(forbidden("You do not have permission to perform this action"));
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: Permission[]) {
  return (req: TenantRequest, _res: Response, next: NextFunction) => {
    const role = req.tenant?.role ?? req.role;
    if (!permissions.some((permission) => hasPermission(role, permission))) {
      next(forbidden("You do not have permission to perform this action"));
      return;
    }
    next();
  };
}

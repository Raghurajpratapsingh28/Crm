import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { ok } from "../../utils/errors.js";

export const auditRouter: Router = Router();
auditRouter.use(requireAuth, requireTenant);

auditRouter.get(
  "/",
  requirePermission(PERMISSIONS.AUDIT_READ),
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const logs = await prisma.auditLog.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(ok(logs));
  }),
);

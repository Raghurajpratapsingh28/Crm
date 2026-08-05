import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";

export const notificationsRouter: Router = Router();
notificationsRouter.use(requireAuth, requireTenant);

notificationsRouter.get(
  "/",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const userId = (req as TenantRequest).auth?.userId;
    if (!userId) throw notFound();
    const rows = await prisma.notification.findMany({
      where: { organizationId, userId },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(rows));
  }),
);

notificationsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const userId = (req as TenantRequest).auth?.userId;
    if (!userId) throw notFound();
    const row = await prisma.notification.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id, userId }),
    });
    if (!row) throw notFound();
    res.json(ok(row));
  }),
);

import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";

export const analyticsRouter: Router = Router();
analyticsRouter.use(requireAuth, requireTenant);

analyticsRouter.get(
  "/me",
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const userId = (req as TenantRequest).auth?.userId;
    if (!userId) throw notFound();
    const [deals, contacts, tasks] = await Promise.all([
      prisma.deal.count({ where: { organizationId, ownerId: userId } }),
      prisma.contact.count({ where: { organizationId, ownerId: userId } }),
      prisma.task.count({ where: { organizationId, assigneeId: userId } }),
    ]);
    res.json(ok({ scope: "personal", deals, contacts, tasks }));
  }),
);

analyticsRouter.get(
  "/team",
  requirePermission(PERMISSIONS.ANALYTICS_TEAM),
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const [deals, contacts, companies, tasks] = await Promise.all([
      prisma.deal.count({ where: { organizationId } }),
      prisma.contact.count({ where: { organizationId } }),
      prisma.company.count({ where: { organizationId } }),
      prisma.task.count({ where: { organizationId } }),
    ]);
    res.json(ok({ scope: "team", deals, contacts, companies, tasks }));
  }),
);

import { PERMISSIONS, type ActivityType } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { assertVisibleAuthored, authorScope } from "../../services/authorization.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";

const TYPES: ActivityType[] = ["CALL", "EMAIL", "MEETING", "NOTE", "STATUS_CHANGE"];

export const activitiesRouter: Router = Router();
activitiesRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

activitiesRouter.get(
  "/",
  requirePermission(PERMISSIONS.ACTIVITIES_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const activities = await prisma.activity.findMany({
      where: { organizationId, ...authorScope(role, userId) },
      orderBy: { occurredAt: "desc" },
    });
    res.json(ok(activities));
  }),
);

activitiesRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.ACTIVITIES_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const activity = await prisma.activity.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!activity) throw notFound();
    assertVisibleAuthored(role, userId, activity.authorId);
    res.json(ok(activity));
  }),
);

activitiesRouter.post(
  "/",
  requirePermission(PERMISSIONS.ACTIVITIES_CREATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const body = req.body as { type?: ActivityType; content?: string; dealId?: string };
    if (!body.type || !TYPES.includes(body.type)) throw invalid("type is invalid");
    if (body.dealId) {
      const deal = await prisma.deal.findFirst({
        where: scopedWhere(organizationId, { id: body.dealId }),
      });
      if (!deal) throw notFound();
    }
    const activity = await prisma.activity.create({
      data: {
        organizationId,
        type: body.type,
        authorId: userId,
        content: body.content?.trim() || null,
        dealId: body.dealId,
      },
    });
    res.status(201).json(ok(activity));
  }),
);

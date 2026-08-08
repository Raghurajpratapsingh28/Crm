import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";
import { createActivity, deleteActivity, getActivity, listActivities, updateActivity } from "./activity.service.js";

export const activitiesRouter: Router = Router();
activitiesRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

function param(value: string | undefined) {
  if (!value) throw notFound();
  return value;
}

activitiesRouter.get(
  "/",
  requirePermission(PERMISSIONS.ACTIVITIES_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listActivities(actor(req as TenantRequest), req.query as Record<string, unknown>)));
  }),
);

activitiesRouter.post(
  "/",
  requirePermission(PERMISSIONS.ACTIVITIES_CREATE),
  asyncHandler(async (req, res) => {
    rejectProtectedFields(req.body, ["authorId", "author_id"]);
    const activity = await createActivity(actor(req as TenantRequest), (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json(ok(activity));
  }),
);

activitiesRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.ACTIVITIES_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getActivity(actor(req as TenantRequest), param(req.params.id))));
  }),
);

activitiesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.ACTIVITIES_UPDATE),
  asyncHandler(async (req, res) => {
    rejectProtectedFields(req.body, ["authorId", "author_id", "type", "dealId", "contactId", "companyId"]);
    res.json(ok(await updateActivity(actor(req as TenantRequest), param(req.params.id), (req.body ?? {}) as Record<string, unknown>)));
  }),
);

activitiesRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.ACTIVITIES_DELETE),
  asyncHandler(async (req, res) => {
    res.json(ok(await deleteActivity(actor(req as TenantRequest), param(req.params.id))));
  }),
);

import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";
import {
  assignDealOwner,
  createDeal,
  deleteDeal,
  getDeal,
  listDeals,
  resetDealProbability,
  transitionDealStage,
  updateDeal,
} from "./deal.service.js";

export const dealsRouter: Router = Router();
dealsRouter.use(requireAuth, requireTenant);

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

function writableBody(body: unknown) {
  const raw = body && typeof body === "object" ? { ...(body as Record<string, unknown>) } : {};
  const ownerId = raw.ownerId;
  delete raw.ownerId;
  rejectProtectedFields(raw, ["stageId", "pipelineId", "wonAt", "lostAt", "probabilitySource"]);
  if (ownerId !== undefined) raw.ownerId = ownerId;
  return raw;
}

async function stageBody(req: TenantRequest) {
  const body = (req.body ?? {}) as { stageId?: string; lostReason?: unknown; resetProbability?: boolean };
  if (!body.stageId) throw invalid("stageId is required");
  return transitionDealStage(actor(req), param(req.params.id), {
    stageId: body.stageId,
    lostReason: body.lostReason,
    resetProbability: Boolean(body.resetProbability),
  });
}

dealsRouter.get(
  "/",
  requirePermission(PERMISSIONS.DEALS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listDeals(actor(req as TenantRequest), req.query as Record<string, unknown>)));
  }),
);

dealsRouter.post(
  "/",
  requirePermission(PERMISSIONS.DEALS_CREATE),
  asyncHandler(async (req, res) => {
    const deal = await createDeal(actor(req as TenantRequest), (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json(ok(deal));
  }),
);

dealsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.DEALS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getDeal(actor(req as TenantRequest), param(req.params.id))));
  }),
);

dealsRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.DEALS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await updateDeal(actor(req as TenantRequest), param(req.params.id), writableBody(req.body))));
  }),
);

dealsRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.DEALS_DELETE),
  asyncHandler(async (req, res) => {
    res.json(ok(await deleteDeal(actor(req as TenantRequest), param(req.params.id))));
  }),
);

dealsRouter.post(
  "/:id/stage",
  requirePermission(PERMISSIONS.DEALS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await stageBody(req as TenantRequest)));
  }),
);

dealsRouter.patch(
  "/:id/stage",
  requirePermission(PERMISSIONS.DEALS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await stageBody(req as TenantRequest)));
  }),
);

dealsRouter.post(
  "/:id/reset-probability",
  requirePermission(PERMISSIONS.DEALS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await resetDealProbability(actor(req as TenantRequest), param(req.params.id))));
  }),
);

dealsRouter.post(
  "/:id/assign",
  requirePermission(PERMISSIONS.DEALS_ASSIGN),
  asyncHandler(async (req, res) => {
    const ownerId = (req.body as { ownerId?: string }).ownerId;
    if (!ownerId) throw invalid("ownerId is required");
    res.json(ok(await assignDealOwner(actor(req as TenantRequest), param(req.params.id), ownerId)));
  }),
);

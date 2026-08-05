import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { writeAudit } from "../../services/audit.service.js";
import { assertVisibleOwned, canAssignResource, ownerScope } from "../../services/authorization.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, invalid, notFound, ok } from "../../utils/errors.js";

function param(value: string | undefined) {
  if (!value) throw notFound();
  return value;
}

export const dealsRouter: Router = Router();
dealsRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

async function loadDeal(organizationId: string, id: string) {
  const deal = await prisma.deal.findFirst({
    where: scopedWhere(organizationId, { id }),
  });
  if (!deal) throw notFound();
  return deal;
}

dealsRouter.get(
  "/",
  requirePermission(PERMISSIONS.DEALS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const deals = await prisma.deal.findMany({
      where: { organizationId, ...ownerScope(role, userId) },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(deals));
  }),
);

dealsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.DEALS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const deal = await loadDeal(organizationId, param(req.params.id));
    assertVisibleOwned(role, userId, deal.ownerId);
    res.json(ok(deal));
  }),
);

dealsRouter.post(
  "/",
  requirePermission(PERMISSIONS.DEALS_CREATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const body = req.body as {
      name?: string;
      companyId?: string;
      primaryContactId?: string;
      pipelineId?: string;
      stageId?: string;
    };
    if (!body.name?.trim()) throw invalid("name is required");
    if (!body.companyId || !body.primaryContactId) {
      throw invalid("companyId and primaryContactId are required");
    }

    const [company, contact, pipeline] = await Promise.all([
      prisma.company.findFirst({ where: scopedWhere(organizationId, { id: body.companyId }) }),
      prisma.contact.findFirst({ where: scopedWhere(organizationId, { id: body.primaryContactId }) }),
      body.pipelineId
        ? prisma.pipeline.findFirst({
            where: scopedWhere(organizationId, { id: body.pipelineId }),
            include: { stages: { orderBy: { order: "asc" } } },
          })
        : prisma.pipeline.findFirst({
            where: { organizationId },
            include: { stages: { orderBy: { order: "asc" } } },
          }),
    ]);
    if (!company || !contact || !pipeline) throw notFound();

    const stage = body.stageId
      ? pipeline.stages.find((row) => row.id === body.stageId && row.organizationId === organizationId)
      : pipeline.stages[0];
    if (!stage) throw invalid("stage does not belong to this organization pipeline");

    const deal = await prisma.deal.create({
      data: {
        organizationId,
        name: body.name.trim(),
        companyId: company.id,
        primaryContactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId: userId,
      },
    });
    res.status(201).json(ok(deal));
  }),
);

dealsRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.DEALS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    rejectProtectedFields(req.body, ["stageId", "pipelineId"]);
    const deal = await loadDeal(organizationId, param(req.params.id));
    assertVisibleOwned(role, userId, deal.ownerId);
    const body = req.body as { name?: string; amount?: number | null };
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: {
        name: body.name?.trim() ?? deal.name,
        amount: body.amount !== undefined ? body.amount : undefined,
      },
    });
    res.json(ok(updated));
  }),
);

dealsRouter.patch(
  "/:id/stage",
  requirePermission(PERMISSIONS.DEALS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const deal = await loadDeal(organizationId, param(req.params.id));
    assertVisibleOwned(role, userId, deal.ownerId);
    const stageId = (req.body as { stageId?: string }).stageId;
    if (!stageId) throw invalid("stageId is required");
    const stage = await prisma.pipelineStage.findFirst({
      where: scopedWhere(organizationId, { id: stageId, pipelineId: deal.pipelineId }),
    });
    if (!stage) throw notFound();
    const updated = await prisma.deal.update({
      where: { id: deal.id },
      data: { stageId: stage.id },
    });
    res.json(ok(updated));
  }),
);

dealsRouter.post(
  "/:id/assign",
  requirePermission(PERMISSIONS.DEALS_ASSIGN),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    if (!canAssignResource(role)) throw forbidden();
    const deal = await loadDeal(organizationId, param(req.params.id));
    const targetUserId = (req.body as { ownerId?: string }).ownerId;
    if (!targetUserId) throw invalid("ownerId is required");

    const membership = await prisma.organizationMember.findFirst({
      where: { organizationId, userId: targetUserId, status: "ACTIVE" },
    });
    if (!membership) throw invalid("target user is not an active member of this organization");

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.deal.update({
        where: { id: deal.id },
        data: { ownerId: targetUserId },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "DEAL_ASSIGNED",
        entityType: "deals",
        entityId: deal.id,
        metadata: { from: deal.ownerId, to: targetUserId },
      });
      await tx.notification.create({
        data: {
          organizationId,
          userId: targetUserId,
          type: "LEAD_ASSIGNED",
          payload: { dealId: deal.id, name: deal.name },
        },
      });
      return next;
    });
    res.json(ok(updated));
  }),
);

dealsRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.DEALS_DELETE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const deal = await loadDeal(organizationId, param(req.params.id));
    assertVisibleOwned(role, userId, deal.ownerId);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "RECORD_DELETED",
        entityType: "deals",
        entityId: deal.id,
        metadata: { name: deal.name },
      });
      await tx.deal.delete({ where: { id: deal.id } });
    });
    res.json(ok({ id: deal.id }));
  }),
);

import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { writeAudit } from "../../services/audit.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";
import { pipelineKanban, pipelineSummary } from "./pipeline-board.service.js";

export const pipelinesRouter: Router = Router();
pipelinesRouter.use(requireAuth, requireTenant);

function param(value: string | undefined) {
  if (!value) throw notFound();
  return value;
}

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

pipelinesRouter.get(
  "/",
  requirePermission(PERMISSIONS.PIPELINE_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const pipelines = await prisma.pipeline.findMany({
      where: { organizationId },
      include: { stages: { orderBy: { order: "asc" } } },
    });
    res.json(ok(pipelines));
  }),
);

pipelinesRouter.get(
  "/:pipelineId/kanban",
  requirePermission(PERMISSIONS.DEALS_READ),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await pipelineKanban(
          actor(req as TenantRequest),
          param(req.params.pipelineId),
          req.query as Record<string, unknown>,
        ),
      ),
    );
  }),
);

pipelinesRouter.get(
  "/:pipelineId/summary",
  requirePermission(PERMISSIONS.DEALS_READ),
  asyncHandler(async (req, res) => {
    res.json(
      ok(
        await pipelineSummary(
          actor(req as TenantRequest),
          param(req.params.pipelineId),
          req.query as Record<string, unknown>,
        ),
      ),
    );
  }),
);

pipelinesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.PIPELINE_MANAGE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    rejectProtectedFields(req.body);
    const pipeline = await prisma.pipeline.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!pipeline) throw notFound();
    const name = (req.body as { name?: string }).name?.trim();
    if (!name) throw invalid("name is required");
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.pipeline.update({ where: { id: pipeline.id }, data: { name } });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "PIPELINE_CHANGED",
        entityType: "pipelines",
        entityId: pipeline.id,
        metadata: { name },
      });
      return next;
    });
    res.json(ok(updated));
  }),
);

pipelinesRouter.post(
  "/:id/stages",
  requirePermission(PERMISSIONS.PIPELINE_MANAGE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const pipeline = await prisma.pipeline.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!pipeline) throw notFound();
    const body = req.body as {
      name?: string;
      key?: string;
      order?: number;
      probability?: number;
      isWon?: boolean;
      isLost?: boolean;
    };
    const name = body.name?.trim();
    if (!name) throw invalid("name is required");
    const probability =
      body.probability === undefined
        ? 0
        : Number.isInteger(body.probability) && body.probability >= 0 && body.probability <= 100
          ? body.probability
          : null;
    if (probability === null) throw invalid("probability must be an integer between 0 and 100");
    const last = await prisma.pipelineStage.aggregate({
      where: { pipelineId: pipeline.id },
      _max: { order: true },
    });
    const stage = await prisma.$transaction(async (tx) => {
      const created = await tx.pipelineStage.create({
        data: {
          organizationId,
          pipelineId: pipeline.id,
          name,
          key: (body.key?.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).replace(/^-|-$/g, ""),
          probability,
          order: body.order ?? (last._max.order ?? -1) + 1,
          isWon: Boolean(body.isWon),
          isLost: Boolean(body.isLost),
        },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "PIPELINE_CHANGED",
        entityType: "pipeline_stages",
        entityId: created.id,
        metadata: { event: "created", name: created.name },
      });
      return created;
    });
    res.status(201).json(ok(stage));
  }),
);

pipelinesRouter.patch(
  "/:pipelineId/stages/:stageId",
  requirePermission(PERMISSIONS.PIPELINE_MANAGE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    rejectProtectedFields(req.body);
    const stage = await prisma.pipelineStage.findFirst({
      where: scopedWhere(organizationId, {
        id: req.params.stageId,
        pipelineId: req.params.pipelineId,
      }),
    });
    if (!stage) throw notFound();
    const body = req.body as {
      name?: string;
      key?: string;
      order?: number;
      probability?: number;
      isWon?: boolean;
      isLost?: boolean;
    };
    if (
      body.probability !== undefined &&
      (!Number.isInteger(body.probability) || body.probability < 0 || body.probability > 100)
    ) {
      throw invalid("probability must be an integer between 0 and 100");
    }
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.pipelineStage.update({
        where: { id: stage.id },
        data: {
          name: body.name?.trim() ?? stage.name,
          key: body.key?.trim() ?? stage.key,
          probability: body.probability ?? stage.probability,
          order: body.order ?? stage.order,
          isWon: body.isWon ?? stage.isWon,
          isLost: body.isLost ?? stage.isLost,
        },
      });
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "PIPELINE_CHANGED",
        entityType: "pipeline_stages",
        entityId: stage.id,
        metadata: { event: "updated" },
      });
      return next;
    });
    res.json(ok(updated));
  }),
);

pipelinesRouter.delete(
  "/:pipelineId/stages/:stageId",
  requirePermission(PERMISSIONS.PIPELINE_MANAGE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const stage = await prisma.pipelineStage.findFirst({
      where: scopedWhere(organizationId, {
        id: req.params.stageId,
        pipelineId: req.params.pipelineId,
      }),
    });
    if (!stage) throw notFound();
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "PIPELINE_CHANGED",
        entityType: "pipeline_stages",
        entityId: stage.id,
        metadata: { event: "deleted", name: stage.name },
      });
      await tx.pipelineStage.delete({ where: { id: stage.id } });
    });
    res.json(ok({ id: stage.id }));
  }),
);

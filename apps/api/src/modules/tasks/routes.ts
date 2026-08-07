import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { writeAudit } from "../../services/audit.service.js";
import { assertVisibleAssigned, assigneeScope } from "../../services/authorization.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";

export const tasksRouter: Router = Router();
tasksRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

tasksRouter.get(
  "/",
  requirePermission(PERMISSIONS.TASKS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const tasks = await prisma.task.findMany({
      where: { organizationId, ...assigneeScope(role, userId) },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(tasks));
  }),
);

tasksRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.TASKS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const task = await prisma.task.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!task) throw notFound();
    assertVisibleAssigned(role, userId, task.assigneeId);
    res.json(ok(task));
  }),
);

tasksRouter.post(
  "/",
  requirePermission(PERMISSIONS.TASKS_CREATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const body = req.body as { title?: string; assigneeId?: string; dealId?: string; companyId?: string; contactId?: string };
    if (!body.title?.trim()) throw invalid("title is required");
    if (body.dealId) {
      const deal = await prisma.deal.findFirst({ where: scopedWhere(organizationId, { id: body.dealId }) });
      if (!deal) throw invalid("deal must belong to this organization");
    }
    if (body.companyId) {
      const company = await prisma.company.findFirst({ where: scopedWhere(organizationId, { id: body.companyId }) });
      if (!company) throw invalid("company must belong to this organization");
    }
    if (body.contactId) {
      const contact = await prisma.contact.findFirst({ where: scopedWhere(organizationId, { id: body.contactId }) });
      if (!contact) throw invalid("contact must belong to this organization");
    }
    const task = await prisma.task.create({
      data: {
        organizationId,
        title: body.title.trim(),
        assigneeId: userId,
        createdById: userId,
        dealId: body.dealId || undefined,
        companyId: body.companyId || undefined,
        contactId: body.contactId || undefined,
      },
    });
    res.status(201).json(ok(task));
  }),
);

tasksRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    rejectProtectedFields(req.body, ["assigneeId", "assignee_id"]);
    const task = await prisma.task.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!task) throw notFound();
    assertVisibleAssigned(role, userId, task.assigneeId);
    const body = req.body as { title?: string; status?: "OPEN" | "DONE" };
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        title: body.title?.trim() ?? task.title,
        status: body.status ?? task.status,
      },
    });
    res.json(ok(updated));
  }),
);

tasksRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.TASKS_DELETE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const task = await prisma.task.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!task) throw notFound();
    assertVisibleAssigned(role, userId, task.assigneeId);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "RECORD_DELETED",
        entityType: "tasks",
        entityId: task.id,
        metadata: { title: task.title },
      });
      await tx.task.delete({ where: { id: task.id } });
    });
    res.json(ok({ id: task.id }));
  }),
);

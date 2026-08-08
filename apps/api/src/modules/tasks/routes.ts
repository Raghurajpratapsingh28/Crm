import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";
import { assignTask, completeTask, createTask, deleteTask, getTask, listTasks, reopenTask, updateTask } from "./task.service.js";

export const tasksRouter: Router = Router();
tasksRouter.use(requireAuth, requireTenant);

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
  const assigneeId = raw.assigneeId;
  delete raw.assigneeId;
  rejectProtectedFields(raw, ["createdById", "created_by", "completedAt", "completed_at", "status"]);
  if (assigneeId !== undefined) raw.assigneeId = assigneeId;
  return raw;
}

tasksRouter.get(
  "/",
  requirePermission(PERMISSIONS.TASKS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listTasks(actor(req as TenantRequest), req.query as Record<string, unknown>)));
  }),
);

tasksRouter.post(
  "/",
  requirePermission(PERMISSIONS.TASKS_CREATE),
  asyncHandler(async (req, res) => {
    rejectProtectedFields(req.body, ["createdById", "created_by", "completedAt", "status"]);
    const task = await createTask(actor(req as TenantRequest), (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json(ok(task));
  }),
);

tasksRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.TASKS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getTask(actor(req as TenantRequest), param(req.params.id))));
  }),
);

tasksRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await updateTask(actor(req as TenantRequest), param(req.params.id), writableBody(req.body))));
  }),
);

tasksRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.TASKS_DELETE),
  asyncHandler(async (req, res) => {
    res.json(ok(await deleteTask(actor(req as TenantRequest), param(req.params.id))));
  }),
);

tasksRouter.post(
  "/:id/complete",
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await completeTask(actor(req as TenantRequest), param(req.params.id))));
  }),
);

tasksRouter.post(
  "/:id/reopen",
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  asyncHandler(async (req, res) => {
    res.json(ok(await reopenTask(actor(req as TenantRequest), param(req.params.id))));
  }),
);

tasksRouter.post(
  "/:id/assign",
  requirePermission(PERMISSIONS.TASKS_UPDATE),
  asyncHandler(async (req, res) => {
    const assigneeId = (req.body as { assigneeId?: string }).assigneeId;
    if (!assigneeId) throw invalid("assigneeId is required");
    res.json(ok(await assignTask(actor(req as TenantRequest), param(req.params.id), assigneeId)));
  }),
);

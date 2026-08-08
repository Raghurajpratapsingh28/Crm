import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";
import { getNotification, listNotifications, markAllRead, markRead, unreadCount } from "./notification.service.js";

export const notificationsRouter: Router = Router();
notificationsRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  if (!userId) throw notFound();
  return { organizationId, userId };
}

const limitNotifications = rateLimit({
  name: "notifications",
  windowMs: 60_000,
  max: 90,
  key: (req) => (req as TenantRequest).auth?.userId ?? req.ip ?? "anon",
});

notificationsRouter.use(limitNotifications);

notificationsRouter.get(
  "/",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listNotifications(actor(req as TenantRequest), req.query as Record<string, unknown>)));
  }),
);

notificationsRouter.get(
  "/unread-count",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await unreadCount(actor(req as TenantRequest))));
  }),
);

notificationsRouter.patch(
  "/read-all",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await markAllRead(actor(req as TenantRequest))));
  }),
);

notificationsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getNotification(actor(req as TenantRequest), req.params.id!)));
  }),
);

notificationsRouter.patch(
  "/:id/read",
  requirePermission(PERMISSIONS.NOTIFICATIONS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await markRead(actor(req as TenantRequest), req.params.id!)));
  }),
);

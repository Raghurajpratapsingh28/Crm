import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";
import {
  leaderboard,
  overview,
  pipeline,
  revenue,
  winRate,
} from "./analytics.controller.js";

export const analyticsRouter: Router = Router();
analyticsRouter.use(requireAuth, requireTenant);
analyticsRouter.use(
  rateLimit({
    name: "analytics",
    windowMs: 60_000,
    max: 60,
    key: (req) => (req as TenantRequest).auth?.userId ?? req.ip ?? "anon",
  }),
);

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

analyticsRouter.get(
  "/overview",
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (req, res) => {
    await overview(req as TenantRequest, res);
  }),
);

analyticsRouter.get(
  "/pipeline",
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (req, res) => {
    await pipeline(req as TenantRequest, res);
  }),
);

analyticsRouter.get(
  "/revenue",
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (req, res) => {
    await revenue(req as TenantRequest, res);
  }),
);

analyticsRouter.get(
  "/win-rate",
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  asyncHandler(async (req, res) => {
    await winRate(req as TenantRequest, res);
  }),
);

analyticsRouter.get(
  "/leaderboard",
  requirePermission(PERMISSIONS.ANALYTICS_TEAM),
  asyncHandler(async (req, res) => {
    await leaderboard(req as TenantRequest, res);
  }),
);

import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, ok } from "../../utils/errors.js";
import {
  createOrganizationForUser,
  getActiveMembership,
  updateCurrentOrganization,
} from "./organization.service.js";

export const organizationsRouter: Router = Router();

organizationsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).auth?.userId;
    if (!userId) throw forbidden();
    const body = req.body as { name?: string; timezone?: string; currency?: string };
    const result = await createOrganizationForUser(userId, {
      name: body.name ?? "",
      timezone: body.timezone,
      currency: body.currency,
    });
    res.status(result.created ? 201 : 200).json(ok(result.organization));
  }),
);

organizationsRouter.get(
  "/current",
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).auth?.userId;
    if (!userId) throw forbidden();
    const membership = await getActiveMembership(userId);
    if (!membership || membership.organizationId !== tenantId(req as TenantRequest)) {
      throw forbidden();
    }
    res.json(
      ok({
        id: membership.organization.id,
        name: membership.organization.name,
        timezone: membership.organization.timezone,
        currency: membership.organization.currency,
        role: membership.role,
        membershipStatus: membership.status,
      }),
    );
  }),
);

organizationsRouter.patch(
  "/current",
  requireAuth,
  requireTenant,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).auth?.userId;
    if (!userId) throw forbidden();
    const body = req.body as { name?: string; timezone?: string; currency?: string };
    const updated = await updateCurrentOrganization(userId, tenantId(req as TenantRequest), body);
    res.json(ok(updated));
  }),
);

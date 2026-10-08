import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { requireAnyPermission } from "../../middleware/permissions.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireTenant, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { search } from "./search.controller.js";

export const searchRouter: Router = Router();
searchRouter.use(requireAuth, requireTenant);
searchRouter.use(
  rateLimit({
    name: "search",
    windowMs: 60_000,
    max: 120,
    key: (req) => (req as TenantRequest).auth?.userId ?? req.ip ?? "anon",
  }),
);

searchRouter.get(
  "/",
  requireAnyPermission(
    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.COMPANIES_READ,
    PERMISSIONS.DEALS_READ,
    PERMISSIONS.ACTIVITIES_READ,
  ),
  asyncHandler(async (req, res) => {
    await search(req as TenantRequest, res);
  }),
);

import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, ok } from "../../utils/errors.js";

export const dealsRouter: Router = Router();

dealsRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const deal = await prisma.deal.findFirst({
      where: scopedWhere(tenantId(req as TenantRequest), { id: req.params.id }),
    });
    if (!deal) throw forbidden();
    res.json(ok(deal));
  }),
);

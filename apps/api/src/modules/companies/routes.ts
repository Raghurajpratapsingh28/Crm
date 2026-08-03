import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, ok } from "../../utils/errors.js";

export const companiesRouter: Router = Router();

companiesRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const company = await prisma.company.findFirst({
      where: scopedWhere(tenantId(req as TenantRequest), { id: req.params.id }),
    });
    if (!company) throw forbidden();
    res.json(ok(company));
  }),
);

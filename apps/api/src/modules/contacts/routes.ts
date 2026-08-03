import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, invalid, ok } from "../../utils/errors.js";

export const contactsRouter: Router = Router();

contactsRouter.get(
  "/:id",
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const contact = await prisma.contact.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!contact) throw forbidden();
    res.json(ok(contact));
  }),
);

contactsRouter.post(
  "/",
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const organizationId = tenantId(req as TenantRequest);
    const userId = (req as TenantRequest).auth?.userId;
    if (!userId) throw forbidden();

    const body = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      companyId?: string;
      organization_id?: string;
      organizationId?: string;
      owner_id?: string;
      ownerId?: string;
    };

    if (!body.firstName?.trim() || !body.lastName?.trim()) {
      throw invalid("firstName and lastName are required");
    }

    if (body.companyId) {
      const company = await prisma.company.findFirst({
        where: scopedWhere(organizationId, { id: body.companyId }),
      });
      if (!company) throw forbidden();
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email?.trim() || null,
        companyId: body.companyId,
        ownerId: userId,
      },
    });
    res.status(201).json(ok(contact));
  }),
);

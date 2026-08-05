import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { prisma } from "../../lib/prisma.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { writeAudit } from "../../services/audit.service.js";
import { assertVisibleOwned, ownerScope } from "../../services/authorization.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";

export const contactsRouter: Router = Router();
contactsRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

contactsRouter.get(
  "/",
  requirePermission(PERMISSIONS.CONTACTS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const contacts = await prisma.contact.findMany({
      where: { organizationId, ...ownerScope(role, userId) },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(contacts));
  }),
);

contactsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.CONTACTS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const contact = await prisma.contact.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!contact) throw notFound();
    assertVisibleOwned(role, userId, contact.ownerId);
    res.json(ok(contact));
  }),
);

contactsRouter.post(
  "/",
  requirePermission(PERMISSIONS.CONTACTS_CREATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const body = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      companyId?: string;
    };

    if (!body.firstName?.trim() || !body.lastName?.trim()) {
      throw invalid("firstName and lastName are required");
    }

    if (body.companyId) {
      const company = await prisma.company.findFirst({
        where: scopedWhere(organizationId, { id: body.companyId }),
      });
      if (!company) throw notFound();
    }

    const contact = await prisma.contact.create({
      data: {
        organizationId,
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        companyId: body.companyId,
        ownerId: userId,
      },
    });
    res.status(201).json(ok(contact));
  }),
);

contactsRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    rejectProtectedFields(req.body);
    const contact = await prisma.contact.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!contact) throw notFound();
    assertVisibleOwned(role, userId, contact.ownerId);

    const body = req.body as {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      companyId?: string | null;
    };

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: {
        firstName: body.firstName?.trim() ?? contact.firstName,
        lastName: body.lastName?.trim() ?? contact.lastName,
        email: body.email !== undefined ? body.email?.trim() || null : contact.email,
        phone: body.phone !== undefined ? body.phone?.trim() || null : contact.phone,
        companyId: body.companyId !== undefined ? body.companyId : contact.companyId,
      },
    });
    res.json(ok(updated));
  }),
);

contactsRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.CONTACTS_DELETE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const contact = await prisma.contact.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!contact) throw notFound();
    assertVisibleOwned(role, userId, contact.ownerId);

    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "RECORD_DELETED",
        entityType: "contacts",
        entityId: contact.id,
        metadata: { name: `${contact.firstName} ${contact.lastName}` },
      });
      await tx.contact.delete({ where: { id: contact.id } });
    });
    res.json(ok({ id: contact.id }));
  }),
);

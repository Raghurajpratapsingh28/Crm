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

export const companiesRouter: Router = Router();
companiesRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

companiesRouter.get(
  "/",
  requirePermission(PERMISSIONS.COMPANIES_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const companies = await prisma.company.findMany({
      where: { organizationId, ...ownerScope(role, userId) },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(companies));
  }),
);

companiesRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.COMPANIES_READ),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const company = await prisma.company.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!company) throw notFound();
    assertVisibleOwned(role, userId, company.ownerId);
    res.json(ok(company));
  }),
);

companiesRouter.post(
  "/",
  requirePermission(PERMISSIONS.COMPANIES_CREATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const body = req.body as { name?: string; industry?: string; website?: string };
    if (!body.name?.trim()) throw invalid("name is required");
    const company = await prisma.company.create({
      data: {
        organizationId,
        name: body.name.trim(),
        industry: body.industry?.trim() || null,
        website: body.website?.trim() || null,
        ownerId: userId,
      },
    });
    res.status(201).json(ok(company));
  }),
);

companiesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.COMPANIES_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    rejectProtectedFields(req.body);
    const company = await prisma.company.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!company) throw notFound();
    assertVisibleOwned(role, userId, company.ownerId);
    const body = req.body as { name?: string; industry?: string; website?: string };
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        name: body.name?.trim() ?? company.name,
        industry: body.industry !== undefined ? body.industry?.trim() || null : company.industry,
        website: body.website !== undefined ? body.website?.trim() || null : company.website,
      },
    });
    res.json(ok(updated));
  }),
);

companiesRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.COMPANIES_DELETE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId, role } = actor(req as TenantRequest);
    const company = await prisma.company.findFirst({
      where: scopedWhere(organizationId, { id: req.params.id }),
    });
    if (!company) throw notFound();
    assertVisibleOwned(role, userId, company.ownerId);
    await prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        organizationId,
        actorId: userId,
        action: "RECORD_DELETED",
        entityType: "companies",
        entityId: company.id,
        metadata: { name: company.name },
      });
      await tx.company.delete({ where: { id: company.id } });
    });
    res.json(ok({ id: company.id }));
  }),
);

import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";
import {
  createCompany,
  deleteCompany,
  getCompany,
  listCompanies,
  suggestCompanyDuplicates,
  updateCompany,
} from "./company.service.js";

export const companiesRouter: Router = Router();
companiesRouter.use(requireAuth, requireTenant);

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
  const ownerId = raw.ownerId;
  delete raw.ownerId;
  rejectProtectedFields(raw);
  if (ownerId !== undefined) raw.ownerId = ownerId;
  return raw;
}

companiesRouter.get(
  "/",
  requirePermission(PERMISSIONS.COMPANIES_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listCompanies(actor(req as TenantRequest), req.query as Record<string, unknown>)));
  }),
);

companiesRouter.get(
  "/duplicates",
  requirePermission(PERMISSIONS.COMPANIES_READ),
  asyncHandler(async (req, res) => {
    const name = String((req.query as { name?: string }).name ?? "");
    res.json(ok(await suggestCompanyDuplicates(actor(req as TenantRequest), name)));
  }),
);

companiesRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.COMPANIES_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getCompany(actor(req as TenantRequest), param(req.params.id))));
  }),
);

companiesRouter.post(
  "/",
  requirePermission(PERMISSIONS.COMPANIES_CREATE),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const company = await createCompany(actor(req as TenantRequest), body);
    res.status(201).json(ok(company));
  }),
);

companiesRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.COMPANIES_UPDATE),
  asyncHandler(async (req, res) => {
    const company = await updateCompany(
      actor(req as TenantRequest),
      param(req.params.id),
      writableBody(req.body),
    );
    res.json(ok(company));
  }),
);

companiesRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.COMPANIES_DELETE),
  asyncHandler(async (req, res) => {
    res.json(ok(await deleteCompany(actor(req as TenantRequest), param(req.params.id))));
  }),
);

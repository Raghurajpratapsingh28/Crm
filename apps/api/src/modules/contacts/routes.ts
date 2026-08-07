import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";
import {
  createContact,
  deleteContact,
  findContactDuplicate,
  getContact,
  listContacts,
  updateContact,
} from "./contact.service.js";

export const contactsRouter: Router = Router();
contactsRouter.use(requireAuth, requireTenant);

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

contactsRouter.get(
  "/",
  requirePermission(PERMISSIONS.CONTACTS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listContacts(actor(req as TenantRequest), req.query as Record<string, unknown>)));
  }),
);

contactsRouter.get(
  "/duplicates",
  requirePermission(PERMISSIONS.CONTACTS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await findContactDuplicate(actor(req as TenantRequest), (req.query as { email?: string }).email)));
  }),
);

contactsRouter.get(
  "/:id",
  requirePermission(PERMISSIONS.CONTACTS_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getContact(actor(req as TenantRequest), param(req.params.id))));
  }),
);

contactsRouter.post(
  "/",
  requirePermission(PERMISSIONS.CONTACTS_CREATE),
  asyncHandler(async (req, res) => {
    const contact = await createContact(actor(req as TenantRequest), (req.body ?? {}) as Record<string, unknown>);
    res.status(201).json(ok(contact));
  }),
);

contactsRouter.patch(
  "/:id",
  requirePermission(PERMISSIONS.CONTACTS_UPDATE),
  asyncHandler(async (req, res) => {
    const contact = await updateContact(
      actor(req as TenantRequest),
      param(req.params.id),
      writableBody(req.body),
    );
    res.json(ok(contact));
  }),
);

contactsRouter.delete(
  "/:id",
  requirePermission(PERMISSIONS.CONTACTS_DELETE),
  asyncHandler(async (req, res) => {
    res.json(ok(await deleteContact(actor(req as TenantRequest), param(req.params.id))));
  }),
);

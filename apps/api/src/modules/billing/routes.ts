import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { rejectProtectedFields } from "../../lib/dto.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { notFound, ok } from "../../utils/errors.js";
import {
  cancelSubscription,
  createCheckout,
  enqueueReconcile,
  getCurrentSubscription,
  getInvoice,
  listInvoices,
  listPublicPlans,
  reactivateSubscription,
} from "./billing.service.js";

export const billingRouter: Router = Router();
billingRouter.use(requireAuth, requireTenant);
billingRouter.use(
  rateLimit({
    name: "billing",
    windowMs: 60_000,
    max: 40,
    key: (req) => (req as TenantRequest).auth?.userId ?? req.ip ?? "anon",
  }),
);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  if (!userId) throw notFound();
  return { organizationId, userId };
}

function body(req: TenantRequest) {
  const raw = req.body && typeof req.body === "object" ? { ...(req.body as Record<string, unknown>) } : {};
  rejectProtectedFields(raw);
  delete raw.amount;
  delete raw.currency;
  delete raw.price;
  delete raw.priceId;
  delete raw.external_price_id;
  delete raw.stripePriceId;
  delete raw.razorpayPlanId;
  delete raw.total;
  return raw;
}

billingRouter.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    res.json(ok(await listPublicPlans()));
  }),
);

billingRouter.get(
  "/",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const [subscription, invoices] = await Promise.all([
      getCurrentSubscription(organizationId),
      listInvoices(organizationId, { limit: 5 }),
    ]);
    res.json(ok({ ...subscription, invoices: invoices.items }));
  }),
);

billingRouter.get(
  "/subscription",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await getCurrentSubscription(actor(req as TenantRequest).organizationId)));
  }),
);

billingRouter.get(
  "/invoices",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    res.json(ok(await listInvoices(actor(req as TenantRequest).organizationId, req.query as Record<string, unknown>)));
  }),
);

billingRouter.get(
  "/invoices/:id",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!id) throw notFound();
    res.json(ok(await getInvoice(actor(req as TenantRequest).organizationId, id)));
  }),
);

billingRouter.post(
  "/checkout",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    const tenant = req as TenantRequest;
    const key = String(req.header("idempotency-key") ?? req.header("Idempotency-Key") ?? "").trim() || undefined;
    const result = await createCheckout(actor(tenant), body(tenant), key);
    res.status(201).json(ok(result));
  }),
);

billingRouter.post(
  "/subscription/cancel",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    const immediately = Boolean((req.body as { immediately?: boolean } | undefined)?.immediately);
    res.json(ok(await cancelSubscription(actor(req as TenantRequest), immediately)));
  }),
);

billingRouter.post(
  "/cancel",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    const immediately = Boolean((req.body as { immediately?: boolean } | undefined)?.immediately);
    res.json(ok(await cancelSubscription(actor(req as TenantRequest), immediately)));
  }),
);

billingRouter.post(
  "/subscription/reactivate",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    res.json(ok(await reactivateSubscription(actor(req as TenantRequest))));
  }),
);

billingRouter.post(
  "/reconcile",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    res.json(ok(await enqueueReconcile(actor(req as TenantRequest))));
  }),
);

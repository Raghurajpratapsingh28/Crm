import type { PaymentProvider } from "@crm/types";
import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { writeAudit } from "../../services/audit.service.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { invalid, notFound, ok } from "../../utils/errors.js";

export const billingRouter: Router = Router();
billingRouter.use(requireAuth, requireTenant);

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  if (!userId) throw notFound();
  return { organizationId, userId };
}

billingRouter.get(
  "/",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });
    res.json(ok({ subscription }));
  }),
);

billingRouter.get(
  "/subscription",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });
    res.json(ok(subscription));
  }),
);

billingRouter.get(
  "/invoices",
  requirePermission(PERMISSIONS.BILLING_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const invoices = await prisma.invoice.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
    res.json(ok(invoices));
  }),
);

billingRouter.post(
  "/checkout",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const provider = (req.body as { provider?: PaymentProvider }).provider;
    if (provider !== "RAZORPAY" && provider !== "STRIPE") {
      throw invalid("provider must be RAZORPAY or STRIPE");
    }
    await writeAudit(prisma, {
      organizationId,
      actorId: userId,
      action: "BILLING_CHANGED",
      entityType: "billing",
      entityId: organizationId,
      metadata: { event: "checkout", provider },
    });
    res.status(201).json(
      ok({
        provider,
        organizationId,
        checkoutUrl: null,
        message: "Wire Razorpay Orders or Stripe Checkout in lib/razorpay.ts / lib/stripe.ts",
      }),
    );
  }),
);

billingRouter.post(
  "/cancel",
  requirePermission(PERMISSIONS.BILLING_MANAGE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId },
    });
    await writeAudit(prisma, {
      organizationId,
      actorId: userId,
      action: "BILLING_CHANGED",
      entityType: "billing",
      entityId: organizationId,
      metadata: { event: "cancel" },
    });
    if (subscription) {
      const updated = await prisma.subscription.update({
        where: { organizationId },
        data: { status: "CANCELED" },
      });
      res.json(ok(updated));
      return;
    }
    res.json(ok({ canceled: true }));
  }),
);

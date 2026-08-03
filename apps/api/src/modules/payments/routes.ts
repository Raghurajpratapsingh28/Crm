import type { PaymentProvider } from "@crm/types";
import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { enqueue } from "../../lib/queue.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/permissions.js";
import { requireTenant, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { AppError } from "../../utils/errors.js";

export const paymentsRouter: Router = Router();

paymentsRouter.post(
  "/billing/checkout",
  requireAuth,
  requireTenant,
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const { organizationId } = req as TenantRequest;
    const provider = (req.body as { provider?: PaymentProvider }).provider;
    if (provider !== "RAZORPAY" && provider !== "STRIPE") {
      throw new AppError(400, "invalid", "provider must be RAZORPAY or STRIPE");
    }

    res.status(201).json({
      provider,
      organizationId,
      checkoutUrl: null,
      message: "Wire Razorpay Orders or Stripe Checkout in lib/razorpay.ts / lib/stripe.ts",
    });
  }),
);

paymentsRouter.post(
  "/webhooks/razorpay",
  asyncHandler(async (req, res) => {
    const eventId = String(req.header("x-razorpay-event-id") ?? crypto.randomUUID());
    await persistAndEnqueue("RAZORPAY", eventId, req.body);
    res.json({ received: true });
  }),
);

paymentsRouter.post(
  "/webhooks/stripe",
  asyncHandler(async (req, res) => {
    const eventId = String(
      (req.body as { id?: string } | undefined)?.id ?? crypto.randomUUID(),
    );
    await persistAndEnqueue("STRIPE", eventId, req.body);
    res.json({ received: true });
  }),
);

async function persistAndEnqueue(
  provider: PaymentProvider,
  eventId: string,
  payload: unknown,
) {
  const body = payload as { organizationId?: string; organization_id?: string } | null;
  const organizationId = body?.organizationId ?? body?.organization_id;
  if (!organizationId) {
    throw new AppError(400, "invalid", "organizationId is required on payment events");
  }

  const event = await prisma.paymentEvent.upsert({
    where: { provider_providerEventId: { provider, providerEventId: eventId } },
    create: {
      organizationId,
      provider,
      providerEventId: eventId,
      eventType: String((payload as { type?: string } | null)?.type ?? "unknown"),
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
    update: {},
  });

  if (!event.processedAt) {
    await enqueue("payments.reconcile", { paymentEventId: event.id, provider });
  }
}

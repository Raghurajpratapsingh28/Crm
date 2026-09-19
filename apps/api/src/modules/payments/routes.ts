import type { Prisma } from "@prisma/client";
import { Router } from "express";
import type { PaymentProvider } from "@crm/types";
import { enqueue } from "../../lib/queue.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireTenant, type TenantRequest } from "../../middleware/tenant.js";
import { requireRole } from "../../middleware/permissions.js";
import { prisma } from "../../lib/prisma.js";

export const paymentsRouter: Router = Router();

paymentsRouter.post(
  "/billing/checkout",
  requireAuth,
  requireTenant,
  requireRole("ADMIN"),
  async (req: TenantRequest, res) => {
    const provider = (req.body as { provider?: PaymentProvider }).provider;
    if (provider !== "RAZORPAY" && provider !== "STRIPE") {
      res.status(400).json({ error: "invalid", message: "provider must be RAZORPAY or STRIPE" });
      return;
    }

    // Provider SDK calls live here. The API only creates a checkout session
    // and stores the intended subscription; the Go worker reconciles webhooks.
    res.status(201).json({
      provider,
      organizationId: req.organizationId,
      checkoutUrl: null,
      message: "Wire Razorpay Orders or Stripe Checkout in lib/razorpay.ts / lib/stripe.ts",
    });
  },
);

paymentsRouter.post("/webhooks/razorpay", async (req, res) => {
  // Verify HMAC with RAZORPAY_WEBHOOK_SECRET before persisting.
  const eventId = String(req.header("x-razorpay-event-id") ?? crypto.randomUUID());
  await persistAndEnqueue("RAZORPAY", eventId, req.body);
  res.json({ received: true });
});

paymentsRouter.post("/webhooks/stripe", async (req, res) => {
  // Verify Stripe-Signature before persisting.
  const eventId = String(req.body?.id ?? crypto.randomUUID());
  await persistAndEnqueue("STRIPE", eventId, req.body);
  res.json({ received: true });
});

async function persistAndEnqueue(
  provider: PaymentProvider,
  eventId: string,
  payload: unknown,
) {
  const event = await prisma.webhookEvent.upsert({
    where: { provider_eventId: { provider, eventId } },
    create: {
      provider,
      eventId,
      eventType: String((payload as { type?: string })?.type ?? "unknown"),
      payload: (payload ?? {}) as Prisma.InputJsonValue,
    },
    update: {},
  });

  if (!event.processedAt) {
    await enqueue("payments.reconcile", { webhookEventId: event.id, provider });
  }
}

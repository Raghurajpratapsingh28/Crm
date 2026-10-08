import Stripe from "stripe";
import { env, stripeEnabled } from "../../config/env.js";
import { fail } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import {
  intervalFromStripe,
  mapStripeInvoiceStatus,
  mapStripeSubscriptionStatus,
  type PaymentProviderAdapter,
  type ProviderInvoice,
  type ProviderSubscription,
  type VerifiedWebhook,
} from "./provider.js";

function client() {
  if (!stripeEnabled) throw fail(503, "BILLING_NOT_CONFIGURED", "Stripe is not configured");
  return new Stripe(env.stripeSecretKey, { timeout: 15_000, maxNetworkRetries: 1 });
}

function unixDate(value?: number | null) {
  return value ? new Date(value * 1000) : null;
}

function stripePeriod(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0] as { current_period_start?: number; current_period_end?: number } | undefined;
  const loose = sub as unknown as { current_period_start?: number; current_period_end?: number };
  return {
    start: unixDate(loose.current_period_start ?? item?.current_period_start),
    end: unixDate(loose.current_period_end ?? item?.current_period_end),
  };
}

function mapSubscription(sub: Stripe.Subscription): ProviderSubscription {
  const item = sub.items.data[0];
  const rec = item?.price?.recurring;
  const period = stripePeriod(sub);
  const loose = sub as unknown as { currency?: string; canceled_at?: number | null; trial_start?: number | null; trial_end?: number | null };
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: mapStripeSubscriptionStatus(sub.status),
    currency: (item?.price?.currency ?? loose.currency ?? "usd").toUpperCase(),
    amountMinor: item?.price?.unit_amount ?? undefined,
    interval: intervalFromStripe(rec?.interval),
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    canceledAt: unixDate(loose.canceled_at),
    trialStart: unixDate(loose.trial_start),
    trialEnd: unixDate(loose.trial_end),
    priceId: typeof item?.price === "string" ? item.price : item?.price?.id,
    rawStatus: sub.status,
  };
}

function stripeInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const loose = invoice as unknown as {
    subscription?: string | { id: string };
    parent?: { subscription_details?: { subscription?: string } };
  };
  if (typeof loose.subscription === "string") return loose.subscription;
  if (loose.subscription && typeof loose.subscription === "object") return loose.subscription.id;
  return loose.parent?.subscription_details?.subscription;
}

function mapInvoice(invoice: Stripe.Invoice): ProviderInvoice {
  if (!invoice.id) throw fail(502, "PAYMENT_PROVIDER_ERROR", "Stripe invoice is missing an id");
  return {
    id: invoice.id,
    subscriptionId: stripeInvoiceSubscriptionId(invoice),
    customerId: typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id,
    status: mapStripeInvoiceStatus(invoice.status ?? "open"),
    currency: (invoice.currency ?? "usd").toUpperCase(),
    amountMinor: invoice.amount_paid || invoice.total || 0,
    invoiceUrl: invoice.hosted_invoice_url ?? undefined,
    pdfUrl: invoice.invoice_pdf ?? undefined,
    number: invoice.number ?? undefined,
    periodStart: unixDate(invoice.period_start),
    periodEnd: unixDate(invoice.period_end),
    dueAt: unixDate(invoice.due_date),
    paidAt: unixDate(invoice.status_transitions?.paid_at),
    rawStatus: invoice.status ?? "open",
  };
}

export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly provider = "STRIPE" as const;

  async createCustomer(input: { organizationId: string; name: string; email?: string }) {
    const stripe = client();
    const customer = await stripe.customers.create(
      {
        name: input.name,
        email: input.email,
        metadata: { organizationId: input.organizationId },
      },
      { timeout: 15_000 },
    );
    return { id: customer.id, email: customer.email ?? undefined, name: customer.name ?? undefined };
  }

  async getCustomer(id: string) {
    const customer = await client().customers.retrieve(id);
    if (customer.deleted) throw fail(502, "PAYMENT_PROVIDER_ERROR", "Stripe customer is deleted");
    return { id: customer.id, email: customer.email ?? undefined, name: customer.name ?? undefined };
  }

  async createCheckout(input: {
    organizationId: string;
    customerId: string;
    priceId: string;
    interval: "MONTH" | "YEAR";
    successUrl: string;
    cancelUrl: string;
    idempotencyKey?: string;
  }) {
    const session = await client().checkout.sessions.create(
      {
        mode: "subscription",
        customer: input.customerId,
        line_items: [{ price: input.priceId, quantity: 1 }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.organizationId,
        metadata: { organizationId: input.organizationId },
        subscription_data: { metadata: { organizationId: input.organizationId } },
      },
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    return {
      checkoutType: "REDIRECT" as const,
      checkoutUrl: session.url ?? undefined,
      sessionId: session.id,
      subscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id,
      customerId: input.customerId,
      publishableKey: env.stripePublishableKey || undefined,
    };
  }

  async getSubscription(id: string) {
    return mapSubscription(await client().subscriptions.retrieve(id));
  }

  async cancelSubscription(id: string, input?: { immediately?: boolean }) {
    const stripe = client();
    if (input?.immediately) {
      return mapSubscription(await stripe.subscriptions.cancel(id));
    }
    return mapSubscription(await stripe.subscriptions.update(id, { cancel_at_period_end: true }));
  }

  async reactivateSubscription(id: string) {
    return mapSubscription(await client().subscriptions.update(id, { cancel_at_period_end: false }));
  }

  async getInvoice(id: string) {
    return mapInvoice(await client().invoices.retrieve(id));
  }

  async verifyWebhook(payload: Buffer | string, signature: string): Promise<VerifiedWebhook> {
    if (!env.stripeWebhookSecret) throw fail(503, "BILLING_NOT_CONFIGURED", "Stripe is not configured");
    try {
      const event = Stripe.webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
      return { id: event.id, type: event.type, data: event.data.object, raw: event };
    } catch (error) {
      logger.warn({ billingProvider: "STRIPE", err: error instanceof Error ? error.message : "invalid" }, "invalid webhook");
      throw fail(400, "INVALID_WEBHOOK", "Webhook signature is invalid");
    }
  }
}

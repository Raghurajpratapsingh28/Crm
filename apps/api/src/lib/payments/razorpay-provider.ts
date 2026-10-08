import { createHmac, timingSafeEqual } from "node:crypto";
import { env, razorpayEnabled } from "../../config/env.js";
import { fail } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import {
  mapRazorpayInvoiceStatus,
  mapRazorpaySubscriptionStatus,
  type PaymentProviderAdapter,
  type ProviderInvoice,
  type ProviderSubscription,
  type VerifiedWebhook,
} from "./provider.js";

function authHeader() {
  return `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64")}`;
}

async function razorpay<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!razorpayEnabled) throw fail(503, "BILLING_NOT_CONFIGURED", "Razorpay is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`https://api.razorpay.com/v1${path}`, {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) {
      logger.warn({ provider: "RAZORPAY", status: res.status, path }, "razorpay error");
      throw fail(502, "PAYMENT_PROVIDER_ERROR", json.error?.description ?? "Razorpay request failed");
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

type RazorpayCustomer = { id: string; email?: string; name?: string };
type RazorpaySubscription = {
  id: string;
  customer_id?: string;
  status: string;
  plan_id?: string;
  current_start?: number;
  current_end?: number;
  charge_at?: number;
  ended_at?: number;
  paid_count?: number;
};
type RazorpayInvoice = {
  id: string;
  subscription_id?: string;
  customer_id?: string;
  status: string;
  currency?: string;
  amount?: number;
  short_url?: string;
  invoice_number?: string;
  billing_start?: number;
  billing_end?: number;
  paid_at?: number;
};

function unixDate(value?: number | null) {
  return value ? new Date(value * 1000) : null;
}

function mapSubscription(row: RazorpaySubscription): ProviderSubscription {
  return {
    id: row.id,
    customerId: row.customer_id ?? "",
    status: mapRazorpaySubscriptionStatus(row.status),
    currency: "INR",
    interval: "MONTH",
    currentPeriodStart: unixDate(row.current_start),
    currentPeriodEnd: unixDate(row.current_end ?? row.charge_at),
    cancelAtPeriodEnd: row.status === "cancelled" && !row.ended_at,
    canceledAt: unixDate(row.ended_at),
    rawStatus: row.status,
    priceId: row.plan_id,
  };
}

function mapInvoice(row: RazorpayInvoice): ProviderInvoice {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    customerId: row.customer_id,
    status: mapRazorpayInvoiceStatus(row.status),
    currency: (row.currency ?? "INR").toUpperCase(),
    amountMinor: row.amount ?? 0,
    invoiceUrl: row.short_url,
    number: row.invoice_number,
    periodStart: unixDate(row.billing_start),
    periodEnd: unixDate(row.billing_end),
    paidAt: unixDate(row.paid_at),
    rawStatus: row.status,
  };
}

export class RazorpayPaymentProvider implements PaymentProviderAdapter {
  readonly provider = "RAZORPAY" as const;

  async createCustomer(input: { organizationId: string; name: string; email?: string }) {
    const customer = await razorpay<RazorpayCustomer>("POST", "/customers", {
      name: input.name,
      email: input.email,
      notes: { organizationId: input.organizationId },
    });
    return { id: customer.id, email: customer.email, name: customer.name };
  }

  async getCustomer(id: string) {
    const customer = await razorpay<RazorpayCustomer>("GET", `/customers/${id}`);
    return { id: customer.id, email: customer.email, name: customer.name };
  }

  async createCheckout(input: {
    organizationId: string;
    customerId: string;
    priceId: string;
    interval: "MONTH" | "YEAR";
    successUrl: string;
    cancelUrl: string;
  }) {
    const totalCount = input.interval === "YEAR" ? 10 : 120;
    const subscription = await razorpay<RazorpaySubscription & { short_url?: string }>("POST", "/subscriptions", {
      plan_id: input.priceId,
      customer_id: input.customerId,
      total_count: totalCount,
      notes: { organizationId: input.organizationId, successUrl: input.successUrl, cancelUrl: input.cancelUrl },
    });
    return {
      checkoutType: "REDIRECT" as const,
      checkoutUrl: subscription.short_url,
      sessionId: subscription.id,
      subscriptionId: subscription.id,
      customerId: input.customerId,
      publishableKey: env.razorpayKeyId || undefined,
    };
  }

  async getSubscription(id: string) {
    return mapSubscription(await razorpay<RazorpaySubscription>("GET", `/subscriptions/${id}`));
  }

  async cancelSubscription(id: string, input?: { immediately?: boolean }) {
    const cancelAtCycleEnd = input?.immediately ? 0 : 1;
    return mapSubscription(
      await razorpay<RazorpaySubscription>("POST", `/subscriptions/${id}/cancel`, { cancel_at_cycle_end: cancelAtCycleEnd }),
    );
  }

  async getInvoice(id: string) {
    return mapInvoice(await razorpay<RazorpayInvoice>("GET", `/invoices/${id}`));
  }

  async verifyWebhook(payload: Buffer | string, signature: string): Promise<VerifiedWebhook> {
    if (!env.razorpayWebhookSecret) throw fail(503, "BILLING_NOT_CONFIGURED", "Razorpay is not configured");
    const raw = typeof payload === "string" ? payload : payload.toString("utf8");
    const expected = createHmac("sha256", env.razorpayWebhookSecret).update(raw).digest("hex");
    const got = signature.trim();
    if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      logger.warn({ provider: "RAZORPAY" }, "invalid webhook");
      throw fail(400, "INVALID_WEBHOOK", "Webhook signature is invalid");
    }
    const parsed = JSON.parse(raw) as { event?: string; payload?: Record<string, { entity?: { id?: string } }>; created_at?: number };
    const entity =
      parsed.payload?.subscription?.entity ??
      parsed.payload?.invoice?.entity ??
      parsed.payload?.payment?.entity ??
      parsed.payload?.["subscription.charged"] ??
      {};
    const id = String((entity as { id?: string }).id ?? parsed.created_at ?? "unknown");
    return { id, type: String(parsed.event ?? "unknown"), data: entity, raw: parsed };
  }
}

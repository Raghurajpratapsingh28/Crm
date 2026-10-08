import type { PaymentProvider } from "@crm/types";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  intervalFromStripe,
  mapRazorpayInvoiceStatus,
  mapRazorpaySubscriptionStatus,
  mapStripeInvoiceStatus,
  mapStripeSubscriptionStatus,
  type PaymentProviderAdapter,
  type ProviderCheckout,
  type ProviderCustomer,
  type ProviderInvoice,
  type ProviderSubscription,
  type VerifiedWebhook,
} from "./provider.js";
import { fromMinorUnits, toMinorUnits } from "./money.js";

export class FakePaymentProvider implements PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  customers = new Map<string, ProviderCustomer>();
  subscriptions = new Map<string, ProviderSubscription>();
  invoices = new Map<string, ProviderInvoice>();
  checkouts: ProviderCheckout[] = [];
  webhookSecret = "whsec_test";

  constructor(provider: PaymentProvider = "STRIPE") {
    this.provider = provider;
  }

  async createCustomer(input: { organizationId: string; name: string; email?: string }) {
    const existing = [...this.customers.values()].find((row) => row.id.endsWith(input.organizationId.slice(0, 8)));
    if (existing) return existing;
    const customer = { id: `cus_${this.provider.toLowerCase()}_${input.organizationId.slice(0, 8)}`, email: input.email, name: input.name };
    this.customers.set(customer.id, customer);
    return customer;
  }

  async getCustomer(id: string) {
    const row = this.customers.get(id);
    if (!row) throw new Error("customer not found");
    return row;
  }

  async createCheckout(input: {
    organizationId: string;
    customerId: string;
    priceId: string;
    interval: "MONTH" | "YEAR";
    successUrl: string;
    cancelUrl: string;
  }) {
    const subId = `sub_${this.provider.toLowerCase()}_${input.organizationId.slice(0, 8)}`;
    const now = new Date();
    const end = new Date(now);
    if (input.interval === "YEAR") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    this.subscriptions.set(subId, {
      id: subId,
      customerId: input.customerId,
      status: "INCOMPLETE",
      currency: this.provider === "RAZORPAY" ? "INR" : "USD",
      amountMinor: 99900,
      interval: input.interval,
      currentPeriodStart: now,
      currentPeriodEnd: end,
      cancelAtPeriodEnd: false,
      priceId: input.priceId,
      rawStatus: "incomplete",
    });
    const checkout: ProviderCheckout = {
      checkoutType: "REDIRECT",
      checkoutUrl: `https://checkout.test/${this.provider.toLowerCase()}/${subId}`,
      sessionId: `cs_${subId}`,
      subscriptionId: subId,
      customerId: input.customerId,
      publishableKey: this.provider === "STRIPE" ? "pk_test_fake" : "rzp_test_fake",
    };
    this.checkouts.push(checkout);
    return checkout;
  }

  async getSubscription(id: string) {
    const row = this.subscriptions.get(id);
    if (!row) throw new Error("subscription not found");
    return row;
  }

  async cancelSubscription(id: string, input?: { immediately?: boolean }) {
    const row = await this.getSubscription(id);
    if (input?.immediately) {
      row.status = "CANCELED";
      row.canceledAt = new Date();
      row.cancelAtPeriodEnd = false;
      row.rawStatus = "canceled";
    } else {
      row.cancelAtPeriodEnd = true;
      row.rawStatus = "active";
    }
    return row;
  }

  async reactivateSubscription(id: string) {
    const row = await this.getSubscription(id);
    row.cancelAtPeriodEnd = false;
    return row;
  }

  async getInvoice(id: string) {
    const row = this.invoices.get(id);
    if (!row) throw new Error("invoice not found");
    return row;
  }

  async verifyWebhook(payload: Buffer | string, signature: string): Promise<VerifiedWebhook> {
    const raw = typeof payload === "string" ? payload : payload.toString("utf8");
    const expected = createHmac("sha256", this.webhookSecret).update(raw).digest("hex");
    const got = signature.replace(/^sha256=/, "");
    if (got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
      throw new Error("invalid signature");
    }
    const parsed = JSON.parse(raw) as {
      id?: string;
      type?: string;
      event?: string;
      data?: unknown;
      payload?: Record<string, { entity?: unknown }>;
      created_at?: number;
    };
    const entity =
      parsed.payload?.subscription?.entity ??
      parsed.payload?.invoice?.entity ??
      parsed.payload?.payment?.entity ??
      parsed.data ??
      parsed;
    return {
      id: String(parsed.id ?? parsed.created_at ?? "unknown"),
      type: String(parsed.type ?? parsed.event ?? "unknown"),
      data: entity,
      raw: parsed,
    };
  }

  seedPaidInvoice(id: string, subscriptionId: string, customerId: string) {
    this.invoices.set(id, {
      id,
      subscriptionId,
      customerId,
      status: "PAID",
      currency: "INR",
      amountMinor: 99900,
      invoiceUrl: `https://invoices.test/${id}`,
      number: "INV-1",
      paidAt: new Date(),
      rawStatus: "paid",
    });
  }
}

export function stripeLikeStatus(status: string) {
  return mapStripeSubscriptionStatus(status);
}

export function razorpayLikeStatus(status: string) {
  return mapRazorpaySubscriptionStatus(status);
}

export { mapStripeInvoiceStatus, mapRazorpayInvoiceStatus, intervalFromStripe, fromMinorUnits, toMinorUnits };

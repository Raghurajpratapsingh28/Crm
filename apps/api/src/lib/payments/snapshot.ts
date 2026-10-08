import type {
  BillingInterval,
  InvoiceStatus,
  PaymentProvider,
  SubscriptionStatus,
} from "@crm/types";

export type InternalBillingEvent =
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_CANCELED"
  | "SUBSCRIPTION_RENEWED"
  | "INVOICE_CREATED"
  | "INVOICE_PAID"
  | "INVOICE_FAILED"
  | "PAYMENT_FAILED";

export type SubscriptionSnapshot = {
  provider: PaymentProvider;
  externalId: string;
  customerId: string;
  status: SubscriptionStatus;
  currency: string;
  amount: string | null;
  interval?: BillingInterval;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialStart: string | null;
  trialEnd: string | null;
  priceId?: string;
  planKey?: string;
};

export type InvoiceSnapshot = {
  provider: PaymentProvider;
  externalId: string;
  subscriptionExternalId?: string;
  customerId?: string;
  status: InvoiceStatus;
  currency: string;
  amount: string;
  invoiceUrl?: string | null;
  pdfUrl?: string | null;
  number?: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueAt: string | null;
  paidAt: string | null;
};

export type BillingSnapshot = {
  version: 1;
  internalType: InternalBillingEvent;
  organizationId?: string;
  checkoutSessionId?: string;
  subscription?: SubscriptionSnapshot;
  invoice?: InvoiceSnapshot;
};

export type StoredPaymentPayload = {
  internalType?: InternalBillingEvent | "UNSUPPORTED";
  snapshot?: BillingSnapshot;
  raw?: unknown;
};

export const STRIPE_EVENT_MAP: Record<string, InternalBillingEvent> = {
  "checkout.session.completed": "SUBSCRIPTION_CREATED",
  "customer.subscription.created": "SUBSCRIPTION_CREATED",
  "customer.subscription.updated": "SUBSCRIPTION_UPDATED",
  "customer.subscription.deleted": "SUBSCRIPTION_CANCELED",
  "customer.subscription.paused": "SUBSCRIPTION_UPDATED",
  "invoice.created": "INVOICE_CREATED",
  "invoice.finalized": "INVOICE_CREATED",
  "invoice.paid": "INVOICE_PAID",
  "invoice.payment_succeeded": "INVOICE_PAID",
  "invoice.payment_failed": "INVOICE_FAILED",
};

export const RAZORPAY_EVENT_MAP: Record<string, InternalBillingEvent> = {
  "subscription.authenticated": "SUBSCRIPTION_UPDATED",
  "subscription.activated": "SUBSCRIPTION_CREATED",
  "subscription.charged": "SUBSCRIPTION_RENEWED",
  "subscription.pending": "SUBSCRIPTION_UPDATED",
  "subscription.halted": "SUBSCRIPTION_UPDATED",
  "subscription.cancelled": "SUBSCRIPTION_CANCELED",
  "subscription.completed": "SUBSCRIPTION_UPDATED",
  "invoice.paid": "INVOICE_PAID",
  "invoice.expired": "INVOICE_FAILED",
  "payment.failed": "PAYMENT_FAILED",
};

export function mapInternalEvent(provider: PaymentProvider, eventType: string): InternalBillingEvent | "UNSUPPORTED" {
  const table = provider === "STRIPE" ? STRIPE_EVENT_MAP : RAZORPAY_EVENT_MAP;
  return table[eventType] ?? "UNSUPPORTED";
}

export function iso(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function parseIso(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

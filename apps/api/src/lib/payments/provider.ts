import type { BillingInterval, InvoiceStatus, PaymentProvider, SubscriptionStatus } from "@crm/types";

export const OPEN_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "INCOMPLETE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "UNPAID",
  "PAUSED",
];

export const BLOCKING_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "UNPAID",
  "PAUSED",
];

const STRIPE_STATUS: Record<string, SubscriptionStatus> = {
  incomplete: "INCOMPLETE",
  incomplete_expired: "EXPIRED",
  trialing: "TRIALING",
  active: "ACTIVE",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  paused: "PAUSED",
};

const RAZORPAY_STATUS: Record<string, SubscriptionStatus> = {
  created: "INCOMPLETE",
  authenticated: "INCOMPLETE",
  active: "ACTIVE",
  pending: "PAST_DUE",
  halted: "PAUSED",
  cancelled: "CANCELED",
  completed: "EXPIRED",
  expired: "EXPIRED",
};

const STRIPE_INVOICE: Record<string, InvoiceStatus> = {
  draft: "DRAFT",
  open: "OPEN",
  paid: "PAID",
  void: "VOID",
  uncollectible: "UNCOLLECTIBLE",
};

const RAZORPAY_INVOICE: Record<string, InvoiceStatus> = {
  draft: "DRAFT",
  issued: "OPEN",
  paid: "PAID",
  cancelled: "VOID",
  expired: "VOID",
  partially_paid: "OPEN",
};

export function mapStripeSubscriptionStatus(status: string): SubscriptionStatus {
  return STRIPE_STATUS[status] ?? "INCOMPLETE";
}

export function mapRazorpaySubscriptionStatus(status: string): SubscriptionStatus {
  return RAZORPAY_STATUS[status] ?? "INCOMPLETE";
}

export function mapStripeInvoiceStatus(status: string): InvoiceStatus {
  return STRIPE_INVOICE[status] ?? "OPEN";
}

export function mapRazorpayInvoiceStatus(status: string): InvoiceStatus {
  return RAZORPAY_INVOICE[status] ?? "OPEN";
}

export function intervalFromStripe(interval?: string | null): BillingInterval {
  return interval === "year" ? "YEAR" : "MONTH";
}

export function isOpenSubscription(status: SubscriptionStatus) {
  return OPEN_SUBSCRIPTION_STATUSES.includes(status);
}

export type ProviderCustomer = {
  id: string;
  email?: string;
  name?: string;
};

export type ProviderCheckout = {
  checkoutType: "REDIRECT" | "EMBEDDED";
  checkoutUrl?: string;
  sessionId?: string;
  subscriptionId?: string;
  customerId: string;
  publishableKey?: string;
};

export type ProviderSubscription = {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  currency: string;
  amountMinor?: number;
  interval: BillingInterval;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  priceId?: string;
  rawStatus: string;
};

export type ProviderInvoice = {
  id: string;
  subscriptionId?: string;
  customerId?: string;
  status: InvoiceStatus;
  currency: string;
  amountMinor: number;
  invoiceUrl?: string;
  pdfUrl?: string;
  number?: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  dueAt?: Date | null;
  paidAt?: Date | null;
  rawStatus: string;
};

export type VerifiedWebhook = {
  id: string;
  type: string;
  data: unknown;
  raw: unknown;
};

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createCustomer(input: { organizationId: string; name: string; email?: string }): Promise<ProviderCustomer>;
  getCustomer(externalCustomerId: string): Promise<ProviderCustomer>;
  createCheckout(input: {
    organizationId: string;
    customerId: string;
    priceId: string;
    interval: BillingInterval;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey?: string;
  }): Promise<ProviderCheckout>;
  getSubscription(externalSubscriptionId: string): Promise<ProviderSubscription>;
  cancelSubscription(
    externalSubscriptionId: string,
    input?: { immediately?: boolean },
  ): Promise<ProviderSubscription>;
  reactivateSubscription?(externalSubscriptionId: string): Promise<ProviderSubscription>;
  getInvoice(externalInvoiceId: string): Promise<ProviderInvoice>;
  verifyWebhook(payload: Buffer | string, signature: string, headers: Record<string, string>): Promise<VerifiedWebhook>;
}

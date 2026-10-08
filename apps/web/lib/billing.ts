import type { BillingInterval, BillingInvoice, BillingPlanPublic, BillingSubscription, CheckoutResponse, PaymentProvider, SubscriptionStatus } from "@crm/types";

export type { BillingInvoice, BillingPlanPublic, BillingSubscription, CheckoutResponse, PaymentProvider };

export const SUBSCRIPTION_LABELS: Record<SubscriptionStatus, string> = {
  INCOMPLETE: "Checkout started",
  TRIALING: "Trial",
  ACTIVE: "Active",
  PAST_DUE: "Payment issue",
  CANCELED: "Canceled",
  UNPAID: "Unpaid",
  PAUSED: "Paused",
  EXPIRED: "Expired",
};

export const INVOICE_LABELS: Record<BillingInvoice["status"], string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  PAID: "Paid",
  VOID: "Void",
  UNCOLLECTIBLE: "Uncollectible",
  FAILED: "Failed",
};

export function formatMoney(amount: string | null | undefined, currency: string) {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${currency} ${amount ?? "0.00"}`;
  }
}

export function formatBillingDate(value: string | null | undefined, timeZone = "UTC") {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone }).format(new Date(value));
  } catch {
    return value.slice(0, 10);
  }
}

export function intervalLabel(interval: BillingInterval) {
  return interval === "YEAR" ? "year" : "month";
}

export function renewalCopy(sub: BillingSubscription, timeZone: string) {
  const end = formatBillingDate(sub.currentPeriodEnd, timeZone);
  if (sub.cancelAtPeriodEnd) return `Your subscription will end on ${end}.`;
  if (sub.status === "CANCELED" || sub.status === "EXPIRED") return "This subscription is no longer renewing.";
  if (sub.currentPeriodEnd) return `Renews on ${end}.`;
  return "Renewal date will appear after the provider confirms payment.";
}

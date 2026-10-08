import { describe, expect, it } from "vitest";
import {
  mapRazorpayInvoiceStatus,
  mapRazorpaySubscriptionStatus,
  mapStripeInvoiceStatus,
  mapStripeSubscriptionStatus,
} from "./provider.js";

describe("provider status maps", () => {
  it("maps Stripe subscription statuses", () => {
    expect(mapStripeSubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapStripeSubscriptionStatus("past_due")).toBe("PAST_DUE");
    expect(mapStripeSubscriptionStatus("canceled")).toBe("CANCELED");
    expect(mapStripeSubscriptionStatus("trialing")).toBe("TRIALING");
  });

  it("maps Razorpay subscription statuses", () => {
    expect(mapRazorpaySubscriptionStatus("active")).toBe("ACTIVE");
    expect(mapRazorpaySubscriptionStatus("halted")).toBe("PAUSED");
    expect(mapRazorpaySubscriptionStatus("cancelled")).toBe("CANCELED");
    expect(mapRazorpaySubscriptionStatus("pending")).toBe("PAST_DUE");
  });

  it("maps invoice statuses", () => {
    expect(mapStripeInvoiceStatus("paid")).toBe("PAID");
    expect(mapStripeInvoiceStatus("open")).toBe("OPEN");
    expect(mapRazorpayInvoiceStatus("issued")).toBe("OPEN");
    expect(mapRazorpayInvoiceStatus("cancelled")).toBe("VOID");
  });
});

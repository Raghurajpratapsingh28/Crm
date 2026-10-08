import type { PaymentProvider } from "@crm/types";
import { env, isTest, razorpayEnabled, stripeEnabled } from "../../config/env.js";
import { fail } from "../../utils/errors.js";
import { FakePaymentProvider } from "./fake.js";
import type { PaymentProviderAdapter } from "./provider.js";
import { RazorpayPaymentProvider } from "./razorpay-provider.js";
import { StripePaymentProvider } from "./stripe-provider.js";

const overrides = new Map<PaymentProvider, PaymentProviderAdapter>();
const fakes = {
  STRIPE: new FakePaymentProvider("STRIPE"),
  RAZORPAY: new FakePaymentProvider("RAZORPAY"),
};
const live = {
  STRIPE: new StripePaymentProvider(),
  RAZORPAY: new RazorpayPaymentProvider(),
};

export function setPaymentProvider(provider: PaymentProvider, adapter: PaymentProviderAdapter | null) {
  if (adapter) overrides.set(provider, adapter);
  else overrides.delete(provider);
}

export function resetPaymentProviders() {
  overrides.clear();
  fakes.STRIPE = new FakePaymentProvider("STRIPE");
  fakes.RAZORPAY = new FakePaymentProvider("RAZORPAY");
}

export function getPaymentProvider(provider: PaymentProvider): PaymentProviderAdapter {
  const override = overrides.get(provider);
  if (override) return override;
  if (isTest) return fakes[provider];
  if (provider === "STRIPE") {
    if (!stripeEnabled) throw fail(503, "BILLING_NOT_CONFIGURED", "Stripe is not configured");
    return live.STRIPE;
  }
  if (provider === "RAZORPAY") {
    if (!razorpayEnabled) throw fail(503, "BILLING_NOT_CONFIGURED", "Razorpay is not configured");
    return live.RAZORPAY;
  }
  throw fail(400, "PROVIDER_NOT_SUPPORTED", "provider must be STRIPE or RAZORPAY");
}

/** Signature verification uses real SDKs when secrets exist so webhook tests can use official signatures. */
export function getWebhookVerifier(provider: PaymentProvider): PaymentProviderAdapter {
  const override = overrides.get(provider);
  if (override) return override;
  if (provider === "STRIPE" && env.stripeWebhookSecret && !isTest) return live.STRIPE;
  if (provider === "RAZORPAY" && env.razorpayWebhookSecret && !isTest) return live.RAZORPAY;
  if (isTest) return fakes[provider];
  return getPaymentProvider(provider);
}

export function enabledProviders(): PaymentProvider[] {
  if (isTest) return ["STRIPE", "RAZORPAY"];
  const list: PaymentProvider[] = [];
  if (stripeEnabled) list.push("STRIPE");
  if (razorpayEnabled) list.push("RAZORPAY");
  return list;
}

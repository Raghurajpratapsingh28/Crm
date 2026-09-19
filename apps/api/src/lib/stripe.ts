/** Stripe client wrapper. Keep secret keys here — never in the Next.js bundle. */
export function createStripeCheckoutSession(_input: {
  organizationId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  throw new Error("Stripe is not configured");
}

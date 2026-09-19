/** Razorpay client wrapper. Keep secret keys here — never in the Next.js bundle. */
export function createRazorpayOrder(_input: {
  amountPaise: number;
  currency: "INR";
  receipt: string;
}) {
  throw new Error("Razorpay is not configured");
}

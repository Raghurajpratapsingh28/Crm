import { Placeholder } from "../placeholder";

export default function Page() {
  return (
    <Placeholder
      title="Billing"
      note="ADMIN only. Choose Razorpay (INR / India) or Stripe (international), then POST /billing/checkout."
    />
  );
}

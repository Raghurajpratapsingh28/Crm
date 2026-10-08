import type { Plan } from "@prisma/client";

export const DEFAULT_BILLING_PLANS: Array<{
  key: string;
  name: string;
  description: string;
  currency: string;
  monthlyPrice: string;
  yearlyPrice: string;
  stripePriceIdMonth: string;
  stripePriceIdYear: string;
  razorpayPlanIdMonth: string;
  razorpayPlanIdYear: string;
  features: string[];
  entitlement: Plan;
}> = [
  {
    key: "starter",
    name: "Starter",
    description: "Pipeline, contacts, and a single sales team.",
    currency: "INR",
    monthlyPrice: "999.00",
    yearlyPrice: "9990.00",
    stripePriceIdMonth: "price_test_starter_month",
    stripePriceIdYear: "price_test_starter_year",
    razorpayPlanIdMonth: "plan_test_starter_month",
    razorpayPlanIdYear: "plan_test_starter_year",
    features: ["3 users", "Pipeline", "Email notifications"],
    entitlement: "STARTER",
  },
  {
    key: "pro",
    name: "Pro",
    description: "Analytics, search, and higher limits for growing teams.",
    currency: "INR",
    monthlyPrice: "1999.00",
    yearlyPrice: "19990.00",
    stripePriceIdMonth: "price_test_pro_month",
    stripePriceIdYear: "price_test_pro_year",
    razorpayPlanIdMonth: "plan_test_pro_month",
    razorpayPlanIdYear: "plan_test_pro_year",
    features: ["Unlimited users", "Analytics", "Priority support"],
    entitlement: "GROWTH",
  },
  {
    key: "business",
    name: "Business",
    description: "For organizations that need auditability and dedicated onboarding.",
    currency: "INR",
    monthlyPrice: "4999.00",
    yearlyPrice: "49990.00",
    stripePriceIdMonth: "price_test_business_month",
    stripePriceIdYear: "price_test_business_year",
    razorpayPlanIdMonth: "plan_test_business_month",
    razorpayPlanIdYear: "plan_test_business_year",
    features: ["SSO-ready", "Audit exports", "Dedicated onboarding"],
    entitlement: "GROWTH",
  },
];

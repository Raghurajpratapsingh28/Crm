import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BillingPage } from "./billing-page";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("../auth-provider", () => ({
  useAuth: () => ({
    session: { access_token: "t" },
    organization: { id: "o1", name: "Acme", timezone: "UTC", currency: "INR", role: "ADMIN" },
    can: () => true,
  }),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiRequestError: class ApiRequestError extends Error {
    code: string;
    status = 400;
    constructor(message: string, code = "INVALID") {
      super(message);
      this.code = code;
    }
  },
}));

describe("Billing page", () => {
  it("shows plans when there is no subscription", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (String(path).includes("/plans")) {
        return Promise.resolve({
          plans: [{ id: "p1", key: "pro", name: "Pro", description: "Pro", currency: "INR", monthlyPrice: "1999.00", yearlyPrice: "19990.00", features: ["Analytics"] }],
          providers: ["STRIPE"],
        });
      }
      if (String(path).includes("/subscription")) return Promise.resolve({ subscription: null });
      return Promise.resolve({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    });
    render(<BillingPage />);
    expect(await screen.findByText("No active subscription")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start checkout" })).toBeEnabled();
    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it("shows renewal versus scheduled cancellation", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (String(path).includes("/plans")) return Promise.resolve({ plans: [], providers: ["STRIPE"] });
      if (String(path).includes("/subscription")) {
        return Promise.resolve({
          subscription: {
            id: "s1",
            organizationId: "o1",
            provider: "STRIPE",
            status: "ACTIVE",
            plan: { id: "p1", key: "pro", name: "Pro", description: null, currency: "INR", monthlyPrice: "1999.00", yearlyPrice: "19990.00", features: [] },
            currency: "INR",
            amount: "1999.00",
            billingInterval: "MONTH",
            currentPeriodStart: "2026-09-01T00:00:00.000Z",
            currentPeriodEnd: "2026-10-20T00:00:00.000Z",
            renewsAt: "2026-10-20T00:00:00.000Z",
            cancelAtPeriodEnd: true,
            canceledAt: null,
            trialStart: null,
            trialEnd: null,
          },
        });
      }
      return Promise.resolve({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    });
    render(<BillingPage />);
    expect(await screen.findByText(/will end on/i)).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/i)).not.toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("does not treat a success query as payment confirmation", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (String(path).includes("/plans")) return Promise.resolve({ plans: [], providers: [] });
      if (String(path).includes("/subscription")) {
        return Promise.resolve({
          subscription: {
            id: "s1",
            organizationId: "o1",
            provider: "STRIPE",
            status: "INCOMPLETE",
            plan: { id: "p1", key: "pro", name: "Pro", description: null, currency: "INR", monthlyPrice: "1999.00", yearlyPrice: "19990.00", features: [] },
            currency: "INR",
            amount: "1999.00",
            billingInterval: "MONTH",
            currentPeriodStart: null,
            currentPeriodEnd: null,
            renewsAt: null,
            cancelAtPeriodEnd: false,
            canceledAt: null,
            trialStart: null,
            trialEnd: null,
          },
        });
      }
      return Promise.resolve({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    });
    render(<BillingPage confirming />);
    expect(await screen.findByText(/confirming your subscription/i)).toBeInTheDocument();
    expect(screen.queryByText(/payment successful/i)).not.toBeInTheDocument();
  });

  it("disables checkout while the request is pending", async () => {
    let resolveCheckout: (value: unknown) => void = () => undefined;
    apiFetch.mockImplementation((path: string, options?: { method?: string }) => {
      if (String(path).includes("/plans")) {
        return Promise.resolve({
          plans: [{ id: "p1", key: "pro", name: "Pro", description: "Pro", currency: "INR", monthlyPrice: "1999.00", yearlyPrice: "19990.00", features: [] }],
          providers: ["STRIPE"],
        });
      }
      if (String(path).includes("/subscription")) return Promise.resolve({ subscription: null });
      if (String(path).includes("/checkout")) {
        return new Promise((resolve) => {
          resolveCheckout = resolve;
        });
      }
      return Promise.resolve({ items: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    });
    const user = userEvent.setup();
    render(<BillingPage />);
    const button = await screen.findByRole("button", { name: "Start checkout" });
    await user.click(button);
    expect(await screen.findByRole("button", { name: "Starting checkout…" })).toBeDisabled();
    resolveCheckout({ provider: "STRIPE", checkoutType: "REDIRECT", checkoutUrl: "https://checkout.test/stripe" });
  });
});

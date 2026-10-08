import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DashboardPage from "../../app/(app)/dashboard/page";

const apiFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("from=2026-09-01&to=2026-09-30"),
}));

vi.mock("../auth-provider", () => {
  const authValue = {
    session: { access_token: "t" },
    user: { id: "u1", email: "admin@test.local", user_metadata: { full_name: "Raghuraj" } },
    organization: { id: "o1", name: "Acme", timezone: "UTC", currency: "INR", role: "ADMIN" },
    can: () => true,
  };
  return { useAuth: () => authValue };
});

vi.mock("../../lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  ApiRequestError: class ApiRequestError extends Error {
    code: string;
    constructor(message: string, code = "INVALID") {
      super(message);
      this.code = code;
    }
  },
}));

describe("Dashboard page", () => {
  it("renders KPI cards from the overview payload", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (String(path).includes("/overview")) {
        return Promise.resolve({
          period: { from: "2026-09-01", to: "2026-09-30", exclusiveTo: "2026-10-01", timeZone: "UTC" },
          previousPeriod: { from: "2026-08-02", to: "2026-08-31", exclusiveTo: "2026-09-01", timeZone: "UTC" },
          metrics: {
            revenue: { amount: "1250000.00", currency: "INR", mixed: false, byCurrency: [], trend: { percent: 20, hasComparison: true } },
            openDeals: 42,
            leads: 17,
            winRate: { value: 38.46, hasData: true, won: 20, lost: 32, trend: { percent: null, hasComparison: false } },
            pipelineValue: { amount: "4800000.00", currency: "INR", mixed: false, byCurrency: [] },
            weightedPipelineValue: { amount: "2100000.00", currency: "INR", mixed: false, byCurrency: [] },
            followUps: { open: 21, overdue: 5, dueToday: 4 },
          },
          recentActivity: [],
        });
      }
      if (String(path).includes("/revenue")) {
        return Promise.resolve({
          period: { from: "2026-09-01", to: "2026-09-30", exclusiveTo: "2026-10-01", timeZone: "UTC" },
          currency: "INR",
          mixed: false,
          total: "1250000.00",
          groupBy: "month",
          series: [{ period: "2026-09", amount: "1250000.00", byCurrency: [] }],
        });
      }
      if (String(path).includes("/pipeline")) {
        return Promise.resolve({
          period: { from: "2026-09-01", to: "2026-09-30", exclusiveTo: "2026-10-01", timeZone: "UTC" },
          pipeline: { id: "p1", name: "Sales" },
          stages: [
            {
              stageId: "s1",
              pipelineId: "p1",
              name: "Lead",
              key: "lead",
              position: 0,
              isWon: false,
              isLost: false,
              dealCount: 15,
              amount: "450000.00",
              weightedAmount: "45000.00",
              currency: "INR",
              mixed: false,
              byCurrency: [],
            },
          ],
        });
      }
      if (String(path).includes("/pipelines")) {
        return Promise.resolve([{ id: "p1", name: "Sales" }]);
      }
      if (String(path).includes("/team")) {
        return Promise.resolve({ items: [] });
      }
      return Promise.resolve({ items: [] });
    });

    render(<DashboardPage />);
    expect(await screen.findByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("No recent activity yet.")).toBeInTheDocument();
  });
});

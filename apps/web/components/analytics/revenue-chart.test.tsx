import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RevenueChart } from "./revenue-chart";
import type { AnalyticsRevenue } from "../../lib/analytics";

const revenue: AnalyticsRevenue = {
  period: { from: "2026-09-01", to: "2026-09-30", exclusiveTo: "2026-10-01", timeZone: "UTC" },
  currency: "INR",
  mixed: false,
  total: "1250000.00",
  groupBy: "month",
  series: [
    { period: "2026-08", amount: "0.00", byCurrency: [] },
    { period: "2026-09", amount: "1250000.00", byCurrency: [{ currency: "INR", amount: "1250000.00" }] },
  ],
};

describe("RevenueChart", () => {
  it("renders total revenue and a table alternative", () => {
    render(<RevenueChart data={revenue} />);
    expect(screen.getByText(/Total revenue/)).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByText("2026-09").length).toBeGreaterThan(0);
  });

  it("shows an empty state instead of a blank chart", () => {
    render(
      <RevenueChart
        data={{ ...revenue, total: "0.00", series: [{ period: "2026-09", amount: "0.00", byCurrency: [] }] }}
      />,
    );
    expect(screen.getByText("No revenue recorded for this period.")).toBeInTheDocument();
  });

  it("errors on invalid series values instead of charting NaN", () => {
    render(
      <RevenueChart
        data={{ ...revenue, series: [{ period: "2026-09", amount: "not-a-number", byCurrency: [] }] }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("invalid");
  });
});

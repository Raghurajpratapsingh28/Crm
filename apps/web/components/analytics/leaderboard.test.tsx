import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Leaderboard } from "./leaderboard";
import type { AnalyticsLeaderboard } from "../../lib/analytics";

const data: AnalyticsLeaderboard = {
  period: { from: "2026-09-01", to: "2026-09-30", exclusiveTo: "2026-10-01", timeZone: "UTC" },
  sortBy: "revenue",
  members: [
    {
      userId: "u1",
      name: "Rahul",
      dealsWon: 8,
      revenue: "1200000.00",
      openPipeline: "3400000.00",
      currency: "INR",
      mixed: false,
      revenueByCurrency: [],
      pipelineByCurrency: [],
    },
  ],
};

describe("Leaderboard", () => {
  it("renders a descriptive table without calling anyone the best", () => {
    render(<Leaderboard data={data} sortBy="revenue" onSort={() => undefined} />);
    expect(screen.getByText("Rahul")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText(/best/i)).not.toBeInTheDocument();
  });
});

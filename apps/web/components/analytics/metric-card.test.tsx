import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MetricCard } from "./metric-card";

describe("MetricCard", () => {
  it("renders title, value, and loading skeleton", () => {
    const { rerender } = render(<MetricCard title="Revenue" loading />);
    expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
    rerender(<MetricCard title="Revenue" value="₹1.25L" subtitle="September 2026" trend="+20.0%" />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("₹1.25L")).toBeInTheDocument();
    expect(screen.getByText("+20.0% vs previous period")).toBeInTheDocument();
  });

  it("shows a section error without inventing a zero", () => {
    render(<MetricCard title="Pipeline" error="Unable to load" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load");
  });
});

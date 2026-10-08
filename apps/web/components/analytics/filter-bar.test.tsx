import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsFilterBar } from "./filter-bar";

const apiFetch = vi.fn();

vi.mock("../../lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

describe("AnalyticsFilterBar", () => {
  it("renders date, owner, department, and pipeline filters", async () => {
    apiFetch.mockImplementation((path: string) => {
      if (String(path).includes("/team")) return Promise.resolve({ items: [{ userId: "u2", fullName: "Rahul" }] });
      return Promise.resolve([{ id: "p1", name: "Sales" }]);
    });
    const onChange = vi.fn();
    render(
      <AnalyticsFilterBar
        token="t"
        timeZone="UTC"
        from="2026-09-01"
        to="2026-09-30"
        owner=""
        team=""
        pipeline=""
        canListOwners
        canFilterTeam
        currentUser={{ id: "u1", name: "Raghuraj" }}
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("Date range")).toBeInTheDocument();
    expect(screen.getByLabelText("Owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Department")).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Sales" })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Date range"), "last_7");
    expect(onChange).toHaveBeenCalled();
  });
});

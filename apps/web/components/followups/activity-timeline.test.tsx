import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityTimeline } from "./activity-timeline";

const apiFetch = vi.fn();

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

describe("ActivityTimeline", () => {
  it("groups activities and renders status changes as stage arrows", async () => {
    apiFetch.mockResolvedValue({
      items: [
        {
          id: "a1",
          type: "CALL",
          content: "Called Rahul about pricing.",
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          author: { id: "u1", fullName: "Raghuraj" },
        },
        {
          id: "a2",
          type: "STATUS_CHANGE",
          content: "Moved from Proposal to Negotiation",
          occurredAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          metadata: { fromStageName: "Proposal", toStageName: "Negotiation" },
          author: { id: "u1", fullName: "Raghuraj" },
        },
      ],
      pagination: { page: 1, limit: 25, total: 2, totalPages: 1 },
    });

    render(<ActivityTimeline token="t" canCreate filters={{ dealId: "d1" }} />);
    expect(await screen.findByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Called Rahul about pricing.")).toBeInTheDocument();
    expect(screen.getByText("Proposal → Negotiation")).toBeInTheDocument();
    expect(screen.getByText("Status Change")).toBeInTheDocument();
  });

  it("opens contextual activity creation", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    render(<ActivityTimeline token="t" canCreate filters={{ dealId: "d1" }} />);
    await screen.findByText("No activity yet");
    await user.click(screen.getByRole("button", { name: "Add Activity" }));
    expect(screen.getByRole("dialog", { name: "Add activity" })).toBeInTheDocument();
    expect(screen.getByLabelText("What happened *")).toBeInTheDocument();
  });
});

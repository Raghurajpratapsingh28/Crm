import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ActivityForm } from "./activity-form";

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

describe("ActivityForm", () => {
  it("creates an activity with an optional follow-up task", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    apiFetch.mockResolvedValue({ id: "a1", type: "CALL", content: "Called customer.", followUpTask: { id: "t1" } });

    render(<ActivityForm token="t" defaults={{ dealId: "d1" }} onSaved={onSaved} />);
    await user.type(screen.getByLabelText("What happened *"), "Called customer.");
    await user.click(screen.getByLabelText("Create follow-up task"));
    await user.type(screen.getByLabelText("Follow-up title"), "Send proposal");
    await user.click(screen.getByRole("button", { name: "Log activity" }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/activities",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Send proposal"),
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});

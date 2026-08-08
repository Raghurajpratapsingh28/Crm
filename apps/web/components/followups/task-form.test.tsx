import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskForm } from "./task-form";

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

vi.mock("../crm/fields", () => ({
  OwnerSelector: () => <div>Assignee</div>,
}));

describe("TaskForm", () => {
  it("creates a task with the entered title", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    apiFetch.mockResolvedValue({ id: "t1", title: "Send revised proposal" });

    render(
      <TaskForm
        token="t"
        currentUser={{ id: "u1", name: "Ada" }}
        canAssign
        defaults={{ dealId: "d1" }}
        onSaved={onSaved}
      />,
    );
    await user.type(screen.getByLabelText("Title *"), "Send revised proposal");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/tasks",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Send revised proposal"),
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});

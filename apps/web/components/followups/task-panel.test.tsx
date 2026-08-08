import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TaskPanel } from "./task-panel";

class ApiRequestError extends Error {
  code: string;
  constructor(message: string, code = "INTERNAL") {
    super(message);
    this.code = code;
  }
}

const apiFetch = vi.fn();

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  },
}));

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

const openTask = {
  id: "t1",
  title: "Send revised proposal",
  status: "OPEN" as const,
  dueDate: "2020-01-01T00:00:00Z",
  isOverdue: true,
  assigneeId: "u1",
  assignee: { id: "u1", fullName: "Raghuraj" },
  company: { id: "c1", name: "Acme Ltd" },
  deal: { id: "d1", name: "Enterprise Contract" },
};

describe("TaskPanel", () => {
  it("renders overdue badges and completes with rollback on failure", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (path: string, options?: { method?: string }) => {
      if (String(path).startsWith("/api/v1/tasks?") || path === "/api/v1/tasks") {
        return { items: [openTask], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } };
      }
      if (String(path).includes("/complete") && options?.method === "POST") {
        throw new ApiRequestError("Unable to complete task. Please try again.");
      }
      return openTask;
    });

    render(
      <TaskPanel
        token="t"
        currentUser={{ id: "u1", name: "Raghuraj" }}
        canCreate
        canAssign
        filters={{ dealId: "d1" }}
      />,
    );

    expect(await screen.findByText("Send revised proposal")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Complete" }));
    expect(await screen.findByText("Unable to complete task. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete" })).toBeInTheDocument();
  });

  it("opens contextual task creation", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue({ items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    render(
      <TaskPanel token="t" currentUser={{ id: "u1", name: "Raghuraj" }} canCreate filters={{ companyId: "c1" }} />,
    );
    await screen.findByText("No tasks");
    await user.click(screen.getByRole("button", { name: "Add Task" }));
    expect(screen.getByRole("dialog", { name: "Add task" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title *")).toBeInTheDocument();
  });
});

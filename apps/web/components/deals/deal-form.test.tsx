import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DealForm } from "./deal-form";

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
  CompanySelector: ({ onChange }: { onChange: (id: string, label?: string) => void }) => (
    <button type="button" onClick={() => onChange("co1", "Acme")}>
      Pick company
    </button>
  ),
  OwnerSelector: () => <div>Owner</div>,
}));

describe("DealForm", () => {
  it("creates a deal with the selected fields", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (path: string) => {
      if (path === "/api/v1/pipelines") {
        return [
          {
            id: "p1",
            name: "Sales",
            stages: [
              { id: "lead", name: "Lead", probability: 10 },
              { id: "proposal", name: "Proposal", probability: 65 },
            ],
          },
        ];
      }
      if (String(path).startsWith("/api/v1/contacts")) {
        return { items: [{ id: "ct1", firstName: "Pat", lastName: "Lee", email: "pat@acme.test" }] };
      }
      return { id: "d1", name: "Acme Enterprise" };
    });

    const onSaved = vi.fn();
    render(
      <DealForm
        token="t"
        currentUser={{ id: "u1", name: "Ada" }}
        canAssign
        submitLabel="Create deal"
        onSaved={onSaved}
      />,
    );

    await screen.findByText("Stage default: 10%");
    await user.type(screen.getByLabelText("Deal name *"), "Acme Enterprise");
    await user.click(screen.getByRole("button", { name: "Pick company" }));
    await user.selectOptions(screen.getByLabelText("Primary contact *"), "ct1");
    await user.selectOptions(screen.getByLabelText("Stage *"), "proposal");
    await user.click(screen.getByRole("button", { name: "Create deal" }));

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/deals",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Acme Enterprise"),
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });
});

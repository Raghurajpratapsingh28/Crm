import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { KanbanBoard } from "../../lib/deals";
import { KanbanBoardView } from "./kanban-board";

vi.mock("next/link", () => ({
  default({ href, children }: { href: string; children: React.ReactNode }) {
    return <a href={href}>{children}</a>;
  },
}));

const board: KanbanBoard = {
  pipeline: { id: "p1", name: "Sales Pipeline" },
  stages: [
    {
      id: "lead",
      name: "Lead",
      position: 0,
      probability: 10,
      isWon: false,
      isLost: false,
      dealCount: 1,
      totalAmount: 1000,
      weightedValue: 100,
      deals: [
        {
          id: "d1",
          name: "Acme Enterprise Contract",
          amount: 1000,
          currency: "USD",
          probability: 10,
          expectedCloseDate: "2026-12-15",
          stageId: "lead",
          ownerId: "u1",
          company: { id: "c1", name: "Acme Ltd" },
          owner: { id: "u1", fullName: "Raghuraj" },
        },
      ],
    },
    {
      id: "contacted",
      name: "Contacted",
      position: 1,
      probability: 20,
      isWon: false,
      isLost: false,
      dealCount: 0,
      totalAmount: 0,
      weightedValue: 0,
      deals: [],
    },
    {
      id: "lost",
      name: "Lost",
      position: 2,
      probability: 0,
      isWon: false,
      isLost: true,
      dealCount: 0,
      totalAmount: 0,
      weightedValue: 0,
      deals: [],
    },
  ],
};

describe("KanbanBoardView", () => {
  it("renders stages in backend order with deals under the correct column", () => {
    render(<KanbanBoardView board={board} onStageChange={vi.fn()} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["Lead", "Contacted", "Lost"]);
    expect(screen.getByText("Acme Enterprise Contract")).toBeInTheDocument();
    expect(screen.getByText("Acme Ltd")).toBeInTheDocument();
    expect(screen.getAllByText("No deals").length).toBeGreaterThan(0);
  });

  it("opens the move-stage dialog as a drag alternative", async () => {
    const user = userEvent.setup();
    const onStageChange = vi.fn().mockResolvedValue(undefined);
    render(<KanbanBoardView board={board} onStageChange={onStageChange} />);
    await user.click(screen.getAllByRole("button", { name: "Move stage" })[0]!);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Stage")).toBeInTheDocument();
    expect(onStageChange).not.toHaveBeenCalled();
  });
});

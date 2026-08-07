import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MoveStageDialog } from "./move-stage-dialog";

const stages = [
  { id: "proposal", name: "Proposal", isWon: false, isLost: false, probability: 65 },
  { id: "lost", name: "Lost", isWon: false, isLost: true, probability: 0 },
  { id: "won", name: "Won", isWon: true, isLost: false, probability: 100 },
];

describe("MoveStageDialog", () => {
  it("requires a lost reason before confirming", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <MoveStageDialog
        open
        stages={stages}
        pendingMove={{ dealId: "d1", dealName: "Acme Enterprise", amount: 250000, currency: "INR", stageId: "lost" }}
        onClose={() => undefined}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText(/Mark deal as Lost/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as Lost" })).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Why was this deal lost?"), "Budget constraints");
    expect(screen.getByRole("button", { name: "Mark as Lost" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Mark as Lost" }));
    expect(onConfirm).toHaveBeenCalledWith("lost", "Budget constraints");
  });

  it("shows a won confirmation", () => {
    render(
      <MoveStageDialog
        open
        stages={stages}
        pendingMove={{ dealId: "d1", dealName: "Acme Enterprise", amount: 250000, currency: "INR", stageId: "won" }}
        onClose={() => undefined}
        onConfirm={() => undefined}
      />,
    );
    expect(screen.getByText(/Mark "Acme Enterprise" as Won/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark as Won" })).toBeInTheDocument();
  });
});

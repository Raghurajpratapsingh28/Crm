import { describe, expect, it } from "vitest";
import type { KanbanBoard } from "./deals";
import { moveDealOnBoard, pipelineSearchFromParams } from "./kanban";

const board: KanbanBoard = {
  pipeline: { id: "p1", name: "Sales" },
  stages: [
    {
      id: "lead",
      name: "Lead",
      position: 0,
      probability: 10,
      isWon: false,
      isLost: false,
      dealCount: 1,
      totalAmount: 100,
      weightedValue: 10,
      deals: [
        {
          id: "d1",
          name: "Acme",
          amount: 100,
          currency: "USD",
          probability: 10,
          expectedCloseDate: null,
          stageId: "lead",
          ownerId: "u1",
          company: { id: "c1", name: "Acme Ltd" },
          owner: { id: "u1", fullName: "Ada" },
        },
      ],
    },
    {
      id: "won",
      name: "Won",
      position: 1,
      probability: 100,
      isWon: true,
      isLost: false,
      dealCount: 0,
      totalAmount: 0,
      weightedValue: 0,
      deals: [],
    },
  ],
};

describe("kanban helpers", () => {
  it("reads filter state from URL params", () => {
    const params = new URLSearchParams("search=acme&owner=u1&minAmount=10");
    expect(pipelineSearchFromParams(params)).toMatchObject({ search: "acme", owner: "u1", minAmount: "10" });
  });

  it("moves a deal between stages and can be rolled back from a snapshot", () => {
    const snapshot = structuredClone(board);
    const moved = moveDealOnBoard(board, "d1", "won");
    expect(moved.stages[0]?.deals).toHaveLength(0);
    expect(moved.stages[1]?.deals[0]?.id).toBe("d1");
    expect(moved.stages[1]?.deals[0]?.stageId).toBe("won");
    expect(snapshot.stages[0]?.deals[0]?.id).toBe("d1");
  });
});

import type { KanbanBoard } from "./deals";

export function pipelineSearchFromParams(params: { get: (key: string) => string | null }) {
  return {
    search: params.get("search") ?? "",
    owner: params.get("owner") ?? "",
    company: params.get("company") ?? "",
    stage: params.get("stage") ?? "",
    minAmount: params.get("minAmount") ?? "",
    maxAmount: params.get("maxAmount") ?? "",
    closeDateFrom: params.get("closeDateFrom") ?? "",
    closeDateTo: params.get("closeDateTo") ?? "",
  };
}

export function moveDealOnBoard(board: KanbanBoard, dealId: string, stageId: string): KanbanBoard {
  const next: KanbanBoard = JSON.parse(JSON.stringify(board)) as KanbanBoard;
  let moving: KanbanBoard["stages"][number]["deals"][number] | undefined;
  for (const stage of next.stages) {
    const index = stage.deals.findIndex((deal) => deal.id === dealId);
    if (index >= 0) {
      moving = stage.deals.splice(index, 1)[0];
      stage.dealCount = Math.max(0, stage.dealCount - 1);
      break;
    }
  }
  if (!moving) return next;
  moving.stageId = stageId;
  const target = next.stages.find((stage) => stage.id === stageId);
  if (target) {
    target.deals.unshift(moving);
    target.dealCount += 1;
  }
  return next;
}

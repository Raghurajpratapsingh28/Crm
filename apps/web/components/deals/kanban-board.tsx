"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { DealCard, KanbanBoard, KanbanStage } from "../../lib/deals";
import { formatMoney } from "../../lib/deals";
import { MoveStageDialog, type PendingStageMove } from "./move-stage-dialog";

function DealCardView({ deal }: { deal: DealCard }) {
  return (
    <article className="deal-card">
      <Link href={`/deals/${deal.id}`}>{deal.name}</Link>
      <div className="muted">{deal.company.name}</div>
      <div>{formatMoney(deal.amount, deal.currency)}</div>
      <div className="muted">
        {deal.probability ?? "—"}% probability
      </div>
      <div className="muted">
        Close: {deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : "—"}
      </div>
      <div className="muted">Owner: {deal.owner.fullName}</div>
    </article>
  );
}

function DraggableDeal({ deal }: { deal: DealCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
      aria-roledescription="Draggable deal"
    >
      <DealCardView deal={deal} />
    </div>
  );
}

function StageColumn({
  stage,
  onPickStage,
}: {
  stage: KanbanStage;
  onPickStage: (deal: DealCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  return (
    <section
      ref={setNodeRef}
      id={`stage-col-${stage.id}`}
      className={`kanban-column${isOver ? " over" : ""}`}
      aria-label={`${stage.name}, ${stage.dealCount} deals, ${formatMoney(stage.totalAmount)}`}
    >
      <header>
        <h2>{stage.name}</h2>
        <p className="muted">
          {stage.dealCount} deals · {formatMoney(stage.totalAmount)}
        </p>
        <p className="muted">{formatMoney(stage.weightedValue)} weighted</p>
      </header>
      <div className="kanban-cards">
        {stage.deals.map((deal) => (
          <div key={deal.id}>
            <DraggableDeal deal={deal} />
            <button type="button" className="secondary move-stage" onClick={() => onPickStage(deal)}>
              Move stage
            </button>
          </div>
        ))}
        {stage.deals.length === 0 ? <p className="muted">No deals</p> : null}
        {stage.hasMore ? (
          <p className="muted">
            Showing {stage.deals.length} of {stage.dealCount}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function KanbanBoardView({
  board,
  onStageChange,
  error,
}: {
  board: KanbanBoard;
  onStageChange: (dealId: string, stageId: string, lostReason?: string) => Promise<void>;
  error?: string | null;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [pendingMove, setPendingMove] = useState<PendingStageMove | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const dealMap = useMemo(() => {
    const map = new Map<string, DealCard>();
    for (const stage of board.stages) for (const deal of stage.deals) map.set(deal.id, deal);
    return map;
  }, [board]);

  async function move(dealId: string, stageId: string, lostReason?: string) {
    setWorking(true);
    try {
      await onStageChange(dealId, stageId, lostReason);
      setPendingMove(null);
    } finally {
      setWorking(false);
    }
  }

  function requestMove(deal: DealCard, stageId?: string) {
    const target = stageId ? board.stages.find((stage) => stage.id === stageId) : undefined;
    if (target && !target.isLost && !target.isWon) {
      void move(deal.id, target.id);
      return;
    }
    setPendingMove({
      dealId: deal.id,
      dealName: deal.name,
      amount: deal.amount,
      currency: deal.currency,
      stageId,
    });
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const dealId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId.startsWith("stage-")) return;
    const stageId = overId.replace("stage-", "");
    const deal = dealMap.get(dealId);
    if (!deal || deal.stageId === stageId) return;
    requestMove(deal, stageId);
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragEnd={onDragEnd}
      >
        {error ? <p className="error">{error}</p> : null}
        {working ? <p className="muted">Updating pipeline…</p> : null}
        <div className="kanban-board">
          {board.stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              onPickStage={(deal) => requestMove(deal)}
            />
          ))}
        </div>
        <DragOverlay>{activeId && dealMap.get(activeId) ? <DealCardView deal={dealMap.get(activeId)!} /> : null}</DragOverlay>
      </DndContext>
      <MoveStageDialog
        open={Boolean(pendingMove)}
        stages={board.stages}
        pendingMove={pendingMove}
        working={working}
        onClose={() => setPendingMove(null)}
        onConfirm={(stageId, lostReason) => {
          if (!pendingMove) return;
          void move(pendingMove.dealId, stageId, lostReason);
        }}
      />
    </>
  );
}

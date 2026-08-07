"use client";

import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "../crm/ui";
import { formatMoney, LOST_REASONS } from "../../lib/deals";

export interface StageOption {
  id: string;
  name: string;
  isWon: boolean;
  isLost: boolean;
  probability: number;
}

export interface PendingStageMove {
  dealId: string;
  dealName: string;
  amount?: number | null;
  currency?: string;
  stageId?: string;
}

export function MoveStageDialog({
  open,
  stages,
  pendingMove,
  working,
  onClose,
  onConfirm,
}: {
  open: boolean;
  stages: StageOption[];
  pendingMove: PendingStageMove | null;
  working?: boolean;
  onClose: () => void;
  onConfirm: (stageId: string, lostReason?: string) => void;
}) {
  const stageFieldId = useId();
  const reasonFieldId = useId();
  const [stageId, setStageId] = useState(pendingMove?.stageId ?? "");
  const [lostReason, setLostReason] = useState("");

  useEffect(() => {
    setStageId(pendingMove?.stageId ?? "");
    setLostReason("");
  }, [pendingMove, open]);

  const target = stages.find((stage) => stage.id === stageId);
  const confirmLabel = target?.isLost ? "Mark as Lost" : target?.isWon ? "Mark as Won" : "Move stage";
  const canSubmit = Boolean(stageId) && (!target?.isLost || lostReason.trim().length > 0);

  return (
    <ConfirmDialog
      open={open}
      title={target?.isLost ? "Mark deal as Lost" : target?.isWon ? `Mark "${pendingMove?.dealName ?? "deal"}" as Won?` : "Move stage"}
      confirmLabel={confirmLabel}
      pending={working}
      disabled={!canSubmit}
      onClose={onClose}
      onConfirm={() => {
        if (!canSubmit) return;
        onConfirm(stageId, target?.isLost ? lostReason.trim() : undefined);
      }}
    >
      <p>
        {pendingMove?.dealName}
        {pendingMove?.amount != null ? ` · ${formatMoney(pendingMove.amount, pendingMove.currency)}` : ""}
        {target?.isWon ? " · Probability: 100%" : ""}
      </p>
      <label htmlFor={stageFieldId}>
        Stage
        <select id={stageFieldId} value={stageId} onChange={(event) => setStageId(event.target.value)}>
          <option value="">Select stage</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </label>
      {target?.isLost ? (
        <label htmlFor={reasonFieldId}>
          Reason
          <textarea
            id={reasonFieldId}
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value)}
            rows={3}
            required
            placeholder="Why was this deal lost?"
          />
          <span className="muted">Examples: {LOST_REASONS.join(", ")}</span>
        </label>
      ) : null}
    </ConfirmDialog>
  );
}

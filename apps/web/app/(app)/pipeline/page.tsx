"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../components/auth-provider";
import { KanbanBoardView } from "../../../components/deals/kanban-board";
import { SearchInput, FilterBar, ErrorState, EmptyState, LoadingState } from "../../../components/crm/ui";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import type { KanbanBoard } from "../../../lib/deals";
import { moveDealOnBoard, pipelineSearchFromParams } from "../../../lib/kanban";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { PERMISSIONS } from "../../../lib/permissions";

export default function PipelinePage() {
  return (
    <Suspense fallback={<main><div className="card wide"><LoadingState label="Loading pipeline" /></div></main>}>
      <PipelineBoard />
    </Suspense>
  );
}

function PipelineBoard() {
  const { session, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [snapshot, setSnapshot] = useState<KanbanBoard | null>(null);
  const [pipelineId, setPipelineId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jumpStage, setJumpStage] = useState("");

  const query = useMemo(() => pipelineSearchFromParams(params), [params]);
  const hasFilters = Object.values(query).some(Boolean);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const pipelines = await apiFetch<Array<{ id: string; name: string; isDefault?: boolean }>>("/api/v1/pipelines", {
        token,
      });
      const active = pipelineId || pipelines.find((p) => p.isDefault)?.id || pipelines[0]?.id || "";
      if (!active) {
        setBoard(null);
        return;
      }
      setPipelineId(active);
      const search = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value) search.set(key, value);
      });
      const kanban = await apiFetch<KanbanBoard>(`/api/v1/pipelines/${active}/kanban?${search}`, { token });
      setBoard(kanban);
      setSnapshot(JSON.parse(JSON.stringify(kanban)) as KanbanBoard);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load pipeline.");
    } finally {
      setLoading(false);
    }
  }, [token, pipelineId, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateQuery(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.replace(`/pipeline?${search.toString()}`);
  }

  async function onStageChange(dealId: string, stageId: string, lostReason?: string) {
    if (!token || !board || !snapshot) return;
    setBoard(moveDealOnBoard(board, dealId, stageId));
    try {
      await apiFetch(`/api/v1/deals/${dealId}/stage`, {
        method: "POST",
        token,
        body: JSON.stringify({ stageId, lostReason }),
      });
      await load();
    } catch (err) {
      setBoard(snapshot);
      setError(
        err instanceof ApiRequestError
          ? `${crmErrorMessage(err.code, err.message)} The deal was restored to its previous stage.`
          : "Unable to move deal. The deal was restored to its previous stage.",
      );
    }
  }

  const totalDeals = board?.stages.reduce((sum, stage) => sum + stage.dealCount, 0) ?? 0;
  const createAction = can(PERMISSIONS.DEALS_CREATE) ? <Link href="/deals/new">Create deal</Link> : null;

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Pipeline</h1>
            <p>{board?.pipeline.name ?? "Sales pipeline"}</p>
          </div>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => void load()}>
              Refresh
            </button>
            {createAction}
          </div>
        </div>
        <FilterBar>
          <SearchInput value={query.search} onChange={(search) => updateQuery({ search })} placeholder="Search deals…" />
          <input
            aria-label="Owner id"
            placeholder="Owner id"
            value={query.owner}
            onChange={(event) => updateQuery({ owner: event.target.value })}
          />
          <input
            aria-label="Company id"
            placeholder="Company id"
            value={query.company}
            onChange={(event) => updateQuery({ company: event.target.value })}
          />
          <select aria-label="Stage" value={query.stage} onChange={(event) => updateQuery({ stage: event.target.value })}>
            <option value="">All stages</option>
            {board?.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Minimum amount"
            placeholder="Min amount"
            value={query.minAmount}
            onChange={(event) => updateQuery({ minAmount: event.target.value })}
          />
          <input
            aria-label="Maximum amount"
            placeholder="Max amount"
            value={query.maxAmount}
            onChange={(event) => updateQuery({ maxAmount: event.target.value })}
          />
          <input
            aria-label="Close date from"
            type="date"
            value={query.closeDateFrom}
            onChange={(event) => updateQuery({ closeDateFrom: event.target.value })}
          />
          <input
            aria-label="Close date to"
            type="date"
            value={query.closeDateTo}
            onChange={(event) => updateQuery({ closeDateTo: event.target.value })}
          />
        </FilterBar>
        {board ? (
          <label className="stage-jump">
            Jump to stage
            <select
              value={jumpStage}
              onChange={(event) => {
                setJumpStage(event.target.value);
                document.getElementById(`stage-col-${event.target.value}`)?.scrollIntoView({ behavior: "smooth", inline: "start" });
              }}
            >
              <option value="">Select stage</option>
              {board.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {loading ? <LoadingState label="Loading pipeline" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && board && totalDeals === 0 && hasFilters ? (
          <EmptyState
            title="No deals match your filters."
            body="Try a different search or clear the current filters."
            action={
              <button type="button" className="secondary" onClick={() => router.replace("/pipeline")}>
                Clear filters
              </button>
            }
          />
        ) : null}
        {!loading && board && totalDeals === 0 && !hasFilters ? (
          <EmptyState
            title="No deals yet"
            body="Create your first deal to start tracking your sales pipeline."
            action={createAction}
          />
        ) : null}
        {board && totalDeals > 0 ? <KanbanBoardView board={board} onStageChange={onStageChange} /> : null}
        {!loading && !board ? (
          <EmptyState
            title="No pipeline found"
            body="Create an organization to provision the default sales pipeline."
          />
        ) : null}
      </div>
    </main>
  );
}

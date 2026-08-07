"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, ErrorState, LoadingState } from "../../../../components/crm/ui";
import { OwnerSelector } from "../../../../components/crm/fields";
import { MoveStageDialog } from "../../../../components/deals/move-stage-dialog";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { formatMoney, type DealRecord } from "../../../../lib/deals";
import { crmErrorMessage } from "../../../../lib/crm-errors";
import { PERMISSIONS } from "../../../../lib/permissions";

interface PipelineOption {
  id: string;
  name: string;
  stages: Array<{ id: string; name: string; isWon: boolean; isLost: boolean; probability: number }>;
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const token = session?.access_token;
  const [deal, setDeal] = useState<DealRecord | null>(null);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const next = await apiFetch<DealRecord>(`/api/v1/deals/${id}`, { token });
    setDeal(next);
    setOwnerId(next.ownerId);
  }, [token, id]);

  useEffect(() => {
    if (!token) return;
    refresh().catch((err) =>
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load deal."),
    );
    apiFetch<PipelineOption[]>("/api/v1/pipelines", { token }).then(setPipelines).catch(() => undefined);
  }, [token, id, refresh]);

  async function remove() {
    if (!token || pending) return;
    setPending(true);
    try {
      await apiFetch(`/api/v1/deals/${id}`, { method: "DELETE", token });
      router.push("/deals");
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to delete deal.");
      setConfirmDelete(false);
    } finally {
      setPending(false);
    }
  }

  async function changeOwner() {
    if (!token || !ownerId || pending) return;
    setPending(true);
    try {
      await apiFetch(`/api/v1/deals/${id}/assign`, { method: "POST", token, body: JSON.stringify({ ownerId }) });
      await refresh();
      setOwnerOpen(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to change owner.");
    } finally {
      setPending(false);
    }
  }

  async function addTask() {
    if (!token || !deal || !taskTitle.trim() || pending) return;
    setPending(true);
    try {
      await apiFetch("/api/v1/tasks", {
        method: "POST",
        token,
        body: JSON.stringify({
          title: taskTitle.trim(),
          dealId: deal.id,
          companyId: deal.companyId,
          contactId: deal.primaryContactId,
        }),
      });
      setTaskTitle("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to add task.");
    } finally {
      setPending(false);
    }
  }

  const stages = pipelines.find((pipeline) => pipeline.id === deal?.pipelineId)?.stages ?? [];

  if (!deal && !error) {
    return (
      <main>
        <div className="card wide">
          <LoadingState label="Loading deal" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        {error ? <ErrorState message={error} /> : null}
        {deal ? (
          <>
            <div className="toolbar">
              <div>
                <h1>{deal.name}</h1>
                <p>
                  {deal.stage?.name ?? "Stage"} · {formatMoney(deal.amount, deal.currency)} · {deal.probability ?? "—"}%
                </p>
                <p className="muted">Owner: {deal.owner.fullName}</p>
              </div>
              <div className="actions">
                {can(PERMISSIONS.DEALS_UPDATE) ? <Link href={`/deals/${deal.id}/edit`}>Edit</Link> : null}
                {can(PERMISSIONS.DEALS_ASSIGN) ? (
                  <button type="button" className="secondary" onClick={() => setOwnerOpen(true)}>
                    Change owner
                  </button>
                ) : null}
                {can(PERMISSIONS.DEALS_UPDATE) ? (
                  <button type="button" className="secondary" onClick={() => setMoveOpen(true)}>
                    Move stage
                  </button>
                ) : null}
                {can(PERMISSIONS.DEALS_DELETE) ? (
                  <button type="button" className="secondary" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            <dl className="details">
              <div>
                <dt>Company</dt>
                <dd>
                  <Link href={`/companies/${deal.company.id}`}>{deal.company.name}</Link>
                </dd>
              </div>
              <div>
                <dt>Primary contact</dt>
                <dd>
                  {deal.primaryContact ? (
                    <Link href={`/contacts/${deal.primaryContact.id}`}>
                      {deal.primaryContact.firstName} {deal.primaryContact.lastName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Expected close</dt>
                <dd>{deal.expectedCloseDate ? new Date(deal.expectedCloseDate).toLocaleDateString() : "—"}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>{deal.currency}</dd>
              </div>
              <div>
                <dt>Lost reason</dt>
                <dd>{deal.lostReasonNote ?? deal.lostReason ?? "—"}</dd>
              </div>
            </dl>
            <section>
              <h2>Description</h2>
              <p>{deal.description || "No description."}</p>
            </section>
            <section>
              <h2>Activity</h2>
              {(deal.activities ?? []).length === 0 ? <p>No activity yet.</p> : (
                <ul className="plain-list">
                  {deal.activities?.map((activity) => (
                    <li key={activity.id}>
                      {activity.type}: {activity.content}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h2>Tasks</h2>
              {(deal.tasks ?? []).length === 0 ? <p>No tasks yet.</p> : (
                <ul className="plain-list">
                  {deal.tasks?.map((task) => (
                    <li key={task.id}>
                      {task.title} · {task.status}
                    </li>
                  ))}
                </ul>
              )}
              {can(PERMISSIONS.TASKS_CREATE) ? (
                <form
                  className="inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addTask();
                  }}
                >
                  <label>
                    Add task
                    <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Follow up next week" />
                  </label>
                  <button type="submit" disabled={pending || !taskTitle.trim()}>
                    Add Task
                  </button>
                </form>
              ) : null}
            </section>
            <section>
              <h2>Stage history</h2>
              {(deal.stageHistory ?? []).length === 0 ? <p>No stage history yet.</p> : (
                <ol className="stage-history">
                  {deal.stageHistory?.map((row) => (
                    <li key={row.id}>
                      <strong>{row.changedBy.fullName}</strong> moved {row.fromStage?.name ?? "Start"} → {row.toStage.name}
                      <div className="muted">{new Date(row.changedAt).toLocaleString()}</div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        ) : null}
      </div>
      <ConfirmDialog open={confirmDelete} title="Delete deal" confirmLabel="Delete" pending={pending} onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)}>
        <p>This cannot be undone.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={ownerOpen}
        title="Change owner"
        confirmLabel="Assign"
        pending={pending}
        onConfirm={() => void changeOwner()}
        onClose={() => setOwnerOpen(false)}
      >
        {token && user ? (
          <OwnerSelector
            token={token}
            value={ownerId}
            onChange={setOwnerId}
            canList={can(PERMISSIONS.DEALS_ASSIGN)}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
          />
        ) : null}
      </ConfirmDialog>
      <MoveStageDialog
        open={moveOpen}
        stages={stages}
        pendingMove={deal ? { dealId: deal.id, dealName: deal.name, amount: deal.amount, currency: deal.currency, stageId: deal.stageId } : null}
        working={pending}
        onClose={() => setMoveOpen(false)}
        onConfirm={(stageId, lostReason) => {
          if (!token) return;
          setPending(true);
          apiFetch(`/api/v1/deals/${id}/stage`, {
            method: "POST",
            token,
            body: JSON.stringify({ stageId, ...(lostReason ? { lostReason } : {}) }),
          })
            .then(() => refresh())
            .then(() => setMoveOpen(false))
            .catch((err) => {
              setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to move deal.");
            })
            .finally(() => setPending(false));
        }}
      />
    </main>
  );
}

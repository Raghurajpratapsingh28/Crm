"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { crmErrorMessage } from "../../lib/crm-errors";
import { relatedLabel, type Paginated, type TaskRecord } from "../../lib/followups";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from "../crm/ui";
import { TaskForm } from "./task-form";
import { TaskDueDate, TaskStatusBadge } from "./task-status-badge";

export function TaskPanel({
  token,
  currentUser,
  canCreate,
  canAssign,
  filters,
}: {
  token?: string;
  currentUser?: { id: string; name: string };
  canCreate?: boolean;
  canAssign?: boolean;
  filters?: { dealId?: string; contactId?: string; companyId?: string };
}) {
  const [items, setItems] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams({ limit: "25", sortBy: "dueDate", sortOrder: "asc" });
    if (filters?.dealId) search.set("dealId", filters.dealId);
    if (filters?.contactId) search.set("contactId", filters.contactId);
    if (filters?.companyId) search.set("companyId", filters.companyId);
    try {
      const res = await apiFetch<Paginated<TaskRecord>>(`/api/v1/tasks?${search}`, { token });
      setItems(res.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [token, filters?.dealId, filters?.contactId, filters?.companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete(task: TaskRecord) {
    if (!token) return;
    const snapshot = items;
    setItems((current) => current.map((row) => (row.id === task.id ? { ...row, status: "DONE", isOverdue: false } : row)));
    try {
      const updated = await apiFetch<TaskRecord>(`/api/v1/tasks/${task.id}/complete`, { method: "POST", token });
      setItems((current) => current.map((row) => (row.id === task.id ? updated : row)));
    } catch (err) {
      setItems(snapshot);
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to complete task. Please try again.");
    }
  }

  return (
    <section className="followup-section">
      <div className="toolbar">
        <h2>Tasks</h2>
        {canCreate ? (
          <button type="button" className="secondary" onClick={() => setOpen(true)}>
            Add Task
          </button>
        ) : null}
      </div>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="Loading tasks" /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState title="No tasks" body="Create a follow-up task to keep work moving." />
      ) : null}
      <ul className="task-cards">
        {items.map((task) => (
          <li key={task.id} className={`task-card${task.isOverdue ? " overdue" : ""}`}>
            <Link href={`/tasks/${task.id}`}>{task.title}</Link>
            <p className="muted">{relatedLabel(task) || "No related record"}</p>
            <p>
              {task.assignee?.fullName ?? "Unassigned"} · <TaskDueDate task={task} /> · <TaskStatusBadge task={task} />
            </p>
            {task.status === "OPEN" ? (
              <button type="button" className="secondary" onClick={() => void complete(task)}>
                Complete
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConfirmDialog open={open} title="Add task" cancelLabel="Close" onClose={() => setOpen(false)}>
        {token && currentUser ? (
          <TaskForm
            token={token}
            currentUser={currentUser}
            canAssign={Boolean(canAssign)}
            defaults={filters}
            onSaved={(task) => {
              setItems((current) => [task, ...current]);
              setOpen(false);
            }}
          />
        ) : null}
      </ConfirmDialog>
    </section>
  );
}

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, ErrorState, LoadingState } from "../../../../components/crm/ui";
import { OwnerSelector } from "../../../../components/crm/fields";
import { TaskForm } from "../../../../components/followups/task-form";
import { TaskDueDate, TaskStatusBadge } from "../../../../components/followups/task-status-badge";
import { useAuth } from "../../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../../lib/api";
import { crmErrorMessage } from "../../../../lib/crm-errors";
import { formatDateTime, relatedLabel, type TaskRecord } from "../../../../lib/followups";
import { PERMISSIONS } from "../../../../lib/permissions";

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session, user, can } = useAuth();
  const router = useRouter();
  const token = session?.access_token;
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [assigneeId, setAssigneeId] = useState("");
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    const next = await apiFetch<TaskRecord>(`/api/v1/tasks/${id}`, { token });
    setTask(next);
    setAssigneeId(next.assigneeId);
  }, [token, id]);

  useEffect(() => {
    if (!token) return;
    refresh().catch((err) =>
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load task."),
    );
  }, [token, refresh]);

  async function run(action: () => Promise<void>, fallback: string) {
    if (!token || pending) return;
    setPending(true);
    try {
      await action();
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : fallback);
    } finally {
      setPending(false);
    }
  }

  if (!task && !error) {
    return (
      <main>
        <div className="card wide">
          <LoadingState label="Loading task" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        {error ? <ErrorState message={error} /> : null}
        {task ? (
          <>
            <div className="toolbar">
              <div>
                <p className="muted">
                  <Link href="/tasks">Tasks</Link>
                </p>
                <h1>{task.title}</h1>
                <p>
                  <TaskStatusBadge task={task} /> · <TaskDueDate task={task} />
                </p>
              </div>
              <div className="actions">
                {can(PERMISSIONS.TASKS_UPDATE) ? (
                  <button type="button" className="secondary" onClick={() => setEdit(true)}>
                    Edit
                  </button>
                ) : null}
                {can(PERMISSIONS.DEALS_ASSIGN) ? (
                  <button type="button" className="secondary" onClick={() => setAssignOpen(true)}>
                    Assign
                  </button>
                ) : null}
                {can(PERMISSIONS.TASKS_UPDATE) && task.status === "OPEN" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void run(async () => {
                        const updated = await apiFetch<TaskRecord>(`/api/v1/tasks/${task.id}/complete`, { method: "POST", token });
                        setTask(updated);
                      }, "Unable to complete task. Please try again.")
                    }
                    disabled={pending}
                  >
                    Complete
                  </button>
                ) : null}
                {can(PERMISSIONS.TASKS_UPDATE) && task.status === "DONE" ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      void run(async () => {
                        const updated = await apiFetch<TaskRecord>(`/api/v1/tasks/${task.id}/reopen`, { method: "POST", token });
                        setTask(updated);
                      }, "Unable to reopen task.")
                    }
                    disabled={pending}
                  >
                    Reopen
                  </button>
                ) : null}
                {can(PERMISSIONS.TASKS_DELETE) ? (
                  <button type="button" className="secondary" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
            <p>{task.description || "No description."}</p>
            <dl className="details">
              <div>
                <dt>Assignee</dt>
                <dd>{task.assignee?.fullName ?? "—"}</dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>{task.creator?.fullName ?? "—"}</dd>
              </div>
              <div>
                <dt>Related</dt>
                <dd>{relatedLabel(task) || "—"}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{task.company ? <Link href={`/companies/${task.company.id}`}>{task.company.name}</Link> : "—"}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>
                  {task.contact ? (
                    <Link href={`/contacts/${task.contact.id}`}>
                      {task.contact.firstName} {task.contact.lastName}
                    </Link>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt>Deal</dt>
                <dd>{task.deal ? <Link href={`/deals/${task.deal.id}`}>{task.deal.name}</Link> : "—"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(task.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(task.updatedAt)}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{formatDateTime(task.completedAt)}</dd>
              </div>
            </dl>
          </>
        ) : null}
      </div>
      <ConfirmDialog open={edit} title="Edit task" cancelLabel="Close" onClose={() => setEdit(false)}>
        {token && user && task ? (
          <TaskForm
            token={token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.DEALS_ASSIGN)}
            submitLabel="Save task"
            initial={task}
            defaults={{ dealId: task.dealId ?? undefined, contactId: task.contactId ?? undefined, companyId: task.companyId ?? undefined }}
            onSaved={(next) => {
              setTask(next);
              setEdit(false);
            }}
          />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={assignOpen}
        title="Assign task"
        confirmLabel="Assign"
        pending={pending}
        onConfirm={() =>
          void run(async () => {
            const updated = await apiFetch<TaskRecord>(`/api/v1/tasks/${id}/assign`, {
              method: "POST",
              token,
              body: JSON.stringify({ assigneeId }),
            });
            setTask(updated);
            setAssignOpen(false);
          }, "Unable to assign task.")
        }
        onClose={() => setAssignOpen(false)}
      >
        {token && user ? (
          <OwnerSelector
            token={token}
            value={assigneeId}
            onChange={setAssigneeId}
            canList={can(PERMISSIONS.DEALS_ASSIGN)}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            label="Assignee"
          />
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete task"
        confirmLabel="Delete"
        pending={pending}
        onConfirm={() =>
          void run(async () => {
            await apiFetch(`/api/v1/tasks/${id}`, { method: "DELETE", token });
            router.push("/tasks");
          }, "Unable to delete task.")
        }
        onClose={() => setConfirmDelete(false)}
      >
        <p>This cannot be undone.</p>
      </ConfirmDialog>
    </main>
  );
}

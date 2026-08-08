"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DataTable } from "../../../components/crm/data-table";
import { ConfirmDialog, ErrorState, FilterBar, LoadingState, Pagination, SearchInput } from "../../../components/crm/ui";
import { TaskForm } from "../../../components/followups/task-form";
import { TaskDueDate, TaskStatusBadge } from "../../../components/followups/task-status-badge";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { dayBounds, relatedLabel, upcomingBounds, type Paginated, type TaskRecord } from "../../../lib/followups";
import { PERMISSIONS } from "../../../lib/permissions";

export default function TasksPage() {
  return (
    <Suspense fallback={<main><div className="card wide"><LoadingState label="Loading tasks" /></div></main>}>
      <TasksList />
    </Suspense>
  );
}

function TasksList() {
  const { session, user, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [data, setData] = useState<Paginated<TaskRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const query = useMemo(
    () => ({
      search: params.get("search") ?? "",
      status: params.get("status") ?? "",
      overdue: params.get("overdue") ?? "",
      assigneeId: params.get("assigneeId") ?? "",
      dueDateFrom: params.get("dueDateFrom") ?? "",
      dueDateTo: params.get("dueDateTo") ?? "",
      page: params.get("page") ?? "1",
    }),
    [params],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
    apiFetch<Paginated<TaskRecord>>(`/api/v1/tasks?${search}`, { token })
      .then(setData)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load tasks."))
      .finally(() => setLoading(false));
  }, [token, query]);

  function update(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.replace(`/tasks?${search}`);
  }

  const createAction = can(PERMISSIONS.TASKS_CREATE) ? (
    <button type="button" onClick={() => setOpen(true)}>
      Add Task
    </button>
  ) : null;

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Tasks</h1>
            <p>What needs to happen next.</p>
          </div>
          {createAction}
        </div>
        <FilterBar>
          <SearchInput value={query.search} onChange={(search) => update({ search, page: "1" })} placeholder="Search tasks…" />
          <button
            type="button"
            className="secondary"
            onClick={() => update({ status: "OPEN", assigneeId: user?.id ?? "", overdue: "", dueDateFrom: "", dueDateTo: "", page: "1" })}
          >
            My Tasks
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const bounds = dayBounds();
              update({ status: "OPEN", overdue: "", dueDateFrom: bounds.from, dueDateTo: bounds.to, assigneeId: "", page: "1" });
            }}
          >
            Today
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              const bounds = upcomingBounds();
              update({ status: "OPEN", overdue: "", dueDateFrom: bounds.from, dueDateTo: bounds.to, assigneeId: "", page: "1" });
            }}
          >
            Upcoming
          </button>
          <button type="button" className="secondary" onClick={() => update({ overdue: "true", status: "", dueDateFrom: "", dueDateTo: "", assigneeId: "", page: "1" })}>
            Overdue
          </button>
          <button type="button" className="secondary" onClick={() => update({ status: "DONE", overdue: "", dueDateFrom: "", dueDateTo: "", assigneeId: "", page: "1" })}>
            Completed
          </button>
          <button type="button" className="secondary" onClick={() => router.replace("/tasks")}>
            All
          </button>
        </FilterBar>
        {error ? <ErrorState message={error} /> : null}
        <DataTable
          columns={[
            { key: "title", header: "Task", render: (row) => row.title },
            { key: "related", header: "Related", render: (row) => relatedLabel(row) || "—" },
            { key: "assignee", header: "Assignee", render: (row) => row.assignee?.fullName ?? "—" },
            { key: "due", header: "Due", render: (row) => <TaskDueDate task={row} /> },
            { key: "status", header: "Status", render: (row) => <TaskStatusBadge task={row} /> },
          ]}
          rows={data?.items ?? []}
          loading={loading}
          emptyTitle={query.search || query.overdue || query.status || query.assigneeId || query.dueDateFrom ? "No tasks match your filters." : "No tasks"}
          emptyBody={query.search || query.overdue || query.status || query.assigneeId || query.dueDateFrom ? "Clear filters to see more follow-ups." : "Create a follow-up task to keep work moving."}
          emptyAction={
            query.search || query.overdue || query.status || query.assigneeId || query.dueDateFrom ? (
              <button type="button" className="secondary" onClick={() => router.replace("/tasks")}>
                Clear filters
              </button>
            ) : (
              createAction
            )
          }
          onRowClick={(row) => router.push(`/tasks/${row.id}`)}
        />
        <Pagination
          page={data?.pagination.page ?? 1}
          totalPages={data?.pagination.totalPages ?? 1}
          onPage={(page) => update({ page: String(page) })}
        />
      </div>
      <ConfirmDialog open={open} title="Add task" cancelLabel="Close" onClose={() => setOpen(false)}>
        {token && user ? (
          <TaskForm
            token={token}
            currentUser={{ id: user.id, name: user.user_metadata?.full_name ?? user.email ?? "You" }}
            canAssign={can(PERMISSIONS.DEALS_ASSIGN)}
            onSaved={(task) => {
              setOpen(false);
              router.push(`/tasks/${task.id}`);
            }}
          />
        ) : null}
      </ConfirmDialog>
    </main>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { DataTable } from "../../../components/crm/data-table";
import { ConfirmDialog, ErrorState, FilterBar, LoadingState, Pagination, SearchInput } from "../../../components/crm/ui";
import { ActivityForm } from "../../../components/followups/activity-form";
import { ActivityTypeIcon } from "../../../components/followups/activity-type-icon";
import { useAuth } from "../../../components/auth-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { crmErrorMessage } from "../../../lib/crm-errors";
import { formatDateTime, relatedLabel, type ActivityRecord, type Paginated } from "../../../lib/followups";
import { PERMISSIONS } from "../../../lib/permissions";

export default function ActivitiesPage() {
  return (
    <Suspense fallback={<main><div className="card wide"><LoadingState label="Loading activities" /></div></main>}>
      <ActivitiesList />
    </Suspense>
  );
}

function ActivitiesList() {
  const { session, can } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [data, setData] = useState<Paginated<ActivityRecord> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [reload, setReload] = useState(0);

  const query = useMemo(
    () => ({
      search: params.get("search") ?? "",
      type: params.get("type") ?? "",
      occurredFrom: params.get("occurredFrom") ?? "",
      occurredTo: params.get("occurredTo") ?? "",
      page: params.get("page") ?? "1",
    }),
    [params],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams(Object.entries(query).filter(([, value]) => value));
    apiFetch<Paginated<ActivityRecord>>(`/api/v1/activities?${search}`, { token })
      .then(setData)
      .catch((err) => setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load activities."))
      .finally(() => setLoading(false));
  }, [token, query, reload]);

  function update(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.replace(`/activities?${search}`);
  }

  const createAction = can(PERMISSIONS.ACTIVITIES_CREATE) ? (
    <button type="button" onClick={() => setOpen(true)}>
      Add Activity
    </button>
  ) : null;

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Activities</h1>
            <p>What happened with customers and deals.</p>
          </div>
          {createAction}
        </div>
        <FilterBar>
          <SearchInput value={query.search} onChange={(search) => update({ search, page: "1" })} placeholder="Search activity…" />
          <select aria-label="Activity type" value={query.type} onChange={(event) => update({ type: event.target.value, page: "1" })}>
            <option value="">All types</option>
            <option value="CALL">Call</option>
            <option value="EMAIL">Email</option>
            <option value="MEETING">Meeting</option>
            <option value="NOTE">Note</option>
            <option value="STATUS_CHANGE">Status Change</option>
          </select>
          <label>
            From
            <input type="date" value={query.occurredFrom} onChange={(event) => update({ occurredFrom: event.target.value, page: "1" })} />
          </label>
          <label>
            To
            <input type="date" value={query.occurredTo} onChange={(event) => update({ occurredTo: event.target.value, page: "1" })} />
          </label>
        </FilterBar>
        {error ? <ErrorState message={error} /> : null}
        <DataTable
          columns={[
            { key: "type", header: "Type", render: (row) => <ActivityTypeIcon type={row.type} /> },
            { key: "content", header: "Content", render: (row) => row.content ?? "—" },
            { key: "author", header: "Author", render: (row) => row.author?.fullName ?? "—" },
            { key: "related", header: "Related", render: (row) => relatedLabel(row) || "—" },
            { key: "occurred", header: "Occurred", render: (row) => formatDateTime(row.occurredAt) },
            { key: "created", header: "Created", render: (row) => formatDateTime(row.createdAt) },
          ]}
          rows={data?.items ?? []}
          loading={loading}
          emptyTitle="No activity yet"
          emptyBody="Record a call, meeting, email, or note to start building the timeline."
          emptyAction={createAction}
        />
        <Pagination
          page={data?.pagination.page ?? 1}
          totalPages={data?.pagination.totalPages ?? 1}
          onPage={(page) => update({ page: String(page) })}
        />
      </div>
      <ConfirmDialog open={open} title="Add activity" cancelLabel="Close" onClose={() => setOpen(false)}>
        {token ? (
          <ActivityForm
            token={token}
            onSaved={() => {
              setOpen(false);
              setReload((value) => value + 1);
            }}
          />
        ) : null}
      </ConfirmDialog>
    </main>
  );
}

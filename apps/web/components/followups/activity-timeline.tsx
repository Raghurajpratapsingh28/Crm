"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { crmErrorMessage } from "../../lib/crm-errors";
import {
  formatTime,
  groupActivitiesByDay,
  relatedLabel,
  type ActivityRecord,
  type Paginated,
} from "../../lib/followups";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from "../crm/ui";
import { ActivityForm } from "./activity-form";
import { ActivityTypeIcon } from "./activity-type-icon";

export function ActivityTimeline({
  token,
  canCreate,
  filters,
}: {
  token?: string;
  canCreate?: boolean;
  filters?: { dealId?: string; contactId?: string; companyId?: string };
}) {
  const [items, setItems] = useState<ActivityRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async (nextPage = 1) => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams({ page: String(nextPage), limit: "25", sortBy: "occurredAt", sortOrder: "desc" });
    if (filters?.dealId) search.set("dealId", filters.dealId);
    if (filters?.contactId) search.set("contactId", filters.contactId);
    if (filters?.companyId) search.set("companyId", filters.companyId);
    try {
      const res = await apiFetch<Paginated<ActivityRecord>>(`/api/v1/activities?${search}`, { token });
      setItems((current) => (nextPage === 1 ? res.items : [...current, ...res.items]));
      setPage(res.pagination.page);
      setTotalPages(res.pagination.totalPages);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load activity.");
    } finally {
      setLoading(false);
    }
  }, [token, filters?.dealId, filters?.contactId, filters?.companyId]);

  useEffect(() => {
    void load(1);
  }, [load]);

  const groups = groupActivitiesByDay(items);

  return (
    <section className="followup-section">
      <div className="toolbar">
        <h2>Activity</h2>
        {canCreate ? (
          <button type="button" className="secondary" onClick={() => setOpen(true)}>
            Add Activity
          </button>
        ) : null}
      </div>
      {error ? <ErrorState message={error} /> : null}
      {loading && items.length === 0 ? <LoadingState label="Loading activity" /> : null}
      {!loading && items.length === 0 ? (
        <EmptyState title="No activity yet" body="Record a call, meeting, email, or note to start building the timeline." />
      ) : null}
      {groups.map((group) => (
        <div key={group.label} className="timeline-group">
          <h3>{group.label}</h3>
          <ol className="timeline">
            {group.items.map((item) => (
              <li key={item.id} className={item.type === "STATUS_CHANGE" ? "status-change" : undefined}>
                <div className="timeline-meta">
                  <ActivityTypeIcon type={item.type} />
                  <span>{formatTime(item.occurredAt)}</span>
                  <span>{item.author?.fullName ?? "Someone"}</span>
                </div>
                <p>
                  {item.type === "STATUS_CHANGE" && item.metadata?.fromStageName
                    ? `${item.metadata.fromStageName} → ${item.metadata.toStageName}`
                    : item.content}
                </p>
                <p className="muted">{relatedLabel(item)}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {page < totalPages ? (
        <button type="button" className="secondary" onClick={() => void load(page + 1)}>
          Load more
        </button>
      ) : null}
      <ConfirmDialog open={open} title="Add activity" cancelLabel="Close" onClose={() => setOpen(false)}>
        {token ? (
          <ActivityForm
            token={token}
            defaults={filters}
            onSaved={(activity) => {
              setItems((current) => [activity, ...current]);
              setOpen(false);
            }}
          />
        ) : null}
      </ConfirmDialog>
    </section>
  );
}

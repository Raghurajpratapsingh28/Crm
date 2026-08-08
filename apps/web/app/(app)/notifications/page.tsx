"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, FilterBar, LoadingState, Pagination } from "../../../components/crm/ui";
import { useAuth } from "../../../components/auth-provider";
import { useNotifications } from "../../../components/notifications/notification-provider";
import { apiFetch, ApiRequestError } from "../../../lib/api";
import { displayNotification, relativeTime, type NotificationList } from "../../../lib/notifications";
import { PERMISSIONS } from "../../../lib/permissions";

export default function NotificationsPage() {
  return (
    <Suspense fallback={<main><div className="card wide"><LoadingState label="Loading notifications" /></div></main>}>
      <NotificationsList />
    </Suspense>
  );
}

function NotificationsList() {
  const { session, can } = useAuth();
  const { markRead, markAllRead, unreadCount, refresh } = useNotifications();
  const router = useRouter();
  const params = useSearchParams();
  const token = session?.access_token;
  const [data, setData] = useState<NotificationList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      unread: params.get("unread") ?? "",
      type: params.get("type") ?? "",
      page: params.get("page") ?? "1",
    }),
    [params],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const search = new URLSearchParams();
    if (query.unread) search.set("unread", query.unread);
    if (query.type) search.set("type", query.type);
    if (query.page) search.set("page", query.page);
    apiFetch<NotificationList>(`/api/v1/notifications?${search}`, { token })
      .then(setData)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Unable to load notifications."))
      .finally(() => setLoading(false));
  }, [token, query, unreadCount]);

  function update(next: Record<string, string>) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    if (next.unread !== undefined || next.type !== undefined) search.delete("page");
    router.replace(`/notifications?${search}`);
  }

  async function openItem(id: string, href: string) {
    await markRead(id);
    if (href === "/notifications") {
      setError("That record is no longer available.");
      return;
    }
    router.push(href);
  }

  if (!can(PERMISSIONS.NOTIFICATIONS_READ)) {
    return (
      <main>
        <div className="card wide">
          <ErrorState message="You do not have access to notifications." />
        </div>
      </main>
    );
  }

  return (
    <main>
      <div className="card wide">
        <div className="toolbar">
          <div>
            <h1>Notifications</h1>
            <p>Mentions of tasks, deals, and team changes.</p>
          </div>
          <button type="button" className="secondary" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
            Mark all as read
          </button>
        </div>
        <FilterBar>
          <button type="button" className={!query.unread ? "secondary" : "ghost"} onClick={() => update({ unread: "" })}>
            All
          </button>
          <button type="button" className={query.unread === "true" ? "secondary" : "ghost"} onClick={() => update({ unread: "true" })}>
            Unread
          </button>
          <label>
            <span className="sr-only">Type</span>
            <select value={query.type} onChange={(event) => update({ type: event.target.value })}>
              <option value="">All types</option>
              <option value="TASK_ASSIGNED">Task assigned</option>
              <option value="TASK_REMINDER">Task reminder</option>
              <option value="FOLLOW_UP_OVERDUE">Task overdue</option>
              <option value="DEAL_ASSIGNED">Deal assigned</option>
              <option value="DEAL_STAGE_CHANGED">Deal stage</option>
              <option value="DEAL_WON">Deal won</option>
              <option value="DEAL_LOST">Deal lost</option>
            </select>
          </label>
        </FilterBar>
        {loading ? <LoadingState label="Loading notifications" /> : null}
        {error ? <ErrorState message={error} /> : null}
        {!loading && data && data.items.length === 0 ? (
          <EmptyState title="No notifications" body="You are caught up. New assignment and deal events will appear here." />
        ) : null}
        <ul className="notification-page-list">
          {data?.items.map((row) => {
            const copy = displayNotification(row);
            return (
              <li key={row.id} className={row.readAt ? "read" : "unread"}>
                <button type="button" onClick={() => void openItem(row.id, copy.href)}>
                  <strong>{copy.heading}</strong>
                  <span>{copy.body}</span>
                  <span className="muted">{relativeTime(row.createdAt)}</span>
                </button>
                {row.readAt ? null : (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void markRead(row.id)}
                  >
                    Mark read
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <Pagination
          page={data?.pagination.page ?? 1}
          totalPages={data?.pagination.totalPages ?? 1}
          onPage={(page) => update({ page: String(page) })}
        />
        <p>
          <Link href="/tasks" onClick={() => void refresh()}>
            Back to tasks
          </Link>
        </p>
      </div>
    </main>
  );
}

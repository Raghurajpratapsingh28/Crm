"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../auth-provider";
import { displayNotification, relativeTime } from "../../lib/notifications";
import { PERMISSIONS } from "../../lib/permissions";
import { useNotifications } from "./notification-provider";

export function NotificationBell() {
  const { can } = useAuth();
  const router = useRouter();
  const { items, unreadCount, loading, error, markRead, markAllRead, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    void refresh();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, refresh]);

  if (!can(PERMISSIONS.NOTIFICATIONS_READ)) return null;

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  async function openItem(id: string, href: string) {
    await markRead(id);
    setOpen(false);
    router.push(href);
  }

  return (
    <div className="notification-tray" ref={rootRef}>
      <button
        type="button"
        className="notification-bell"
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="notification-dropdown" id={menuId} role="menu" aria-label="Notifications">
          <div className="notification-dropdown-head">
            <strong>Notifications</strong>
            <button type="button" className="ghost" onClick={() => void markAllRead()} disabled={unreadCount === 0}>
              Mark all read
            </button>
          </div>
          {loading && items.length === 0 ? <p className="muted">Loading notifications…</p> : null}
          {error ? <p className="error" role="alert">{error}</p> : null}
          {!loading && !error && items.length === 0 ? <p className="muted">No notifications yet.</p> : null}
          <ul className="notification-list">
            {items.map((row) => {
              const copy = displayNotification(row);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={row.readAt ? "read" : "unread"}
                    onClick={() => void openItem(row.id, copy.href)}
                  >
                    <strong>{copy.heading}</strong>
                    <span>{copy.body}</span>
                    <span className="muted">{relativeTime(row.createdAt)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Link href="/notifications" className="notification-view-all" onClick={() => setOpen(false)}>
            View all
          </Link>
        </div>
      ) : null}
    </div>
  );
}

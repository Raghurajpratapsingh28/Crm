"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch } from "../../lib/api";
import type { NotificationItem, NotificationList } from "../../lib/notifications";
import { PERMISSIONS } from "../../lib/permissions";

const POLL_MS = 45_000;
const DROPDOWN_LIMIT = 8;

interface NotificationContextValue {
  items: NotificationItem[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<NotificationItem | null>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session, can } = useAuth();
  const token = session?.access_token;
  const allowed = Boolean(token) && can(PERMISSIONS.NOTIFICATIONS_READ);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token || !allowed) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        apiFetch<NotificationList>(`/api/v1/notifications?limit=${DROPDOWN_LIMIT}`, { token }),
        apiFetch<{ count: number }>("/api/v1/notifications/unread-count", { token }),
      ]);
      setItems(list.items);
      setUnreadCount(count.count);
      setError(null);
    } catch {
      setError("Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [token, allowed]);

  useEffect(() => {
    if (!allowed || !token) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const load = () => {
      if (!cancelled) void refresh();
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [allowed, token, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return null;
      const current = items.find((row) => row.id === id);
      const wasUnread = Boolean(current && !current.readAt);
      const previousItems = items;
      const previousCount = unreadCount;
      const readAt = new Date().toISOString();
      setItems((rows) => rows.map((row) => (row.id === id ? { ...row, readAt } : row)));
      if (wasUnread) setUnreadCount((value) => Math.max(0, value - 1));
      try {
        const updated = await apiFetch<NotificationItem>(`/api/v1/notifications/${id}/read`, {
          method: "PATCH",
          token,
        });
        setItems((rows) => rows.map((row) => (row.id === id ? { ...row, ...updated } : row)));
        setError(null);
        return updated;
      } catch {
        setItems(previousItems);
        setUnreadCount(previousCount);
        setError("Unable to mark notification as read.");
        return null;
      }
    },
    [token, items, unreadCount],
  );

  const markAllRead = useCallback(async () => {
    if (!token) return;
    const previousItems = items;
    const previousCount = unreadCount;
    const readAt = new Date().toISOString();
    setItems((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? readAt })));
    setUnreadCount(0);
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "PATCH", token });
      setError(null);
    } catch {
      setItems(previousItems);
      setUnreadCount(previousCount);
      setError("Unable to mark notifications as read.");
    }
  }, [token, items, unreadCount]);

  const value = useMemo(
    () => ({ items, unreadCount, loading, error, refresh, markRead, markAllRead }),
    [items, unreadCount, loading, error, refresh, markRead, markAllRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return value;
}

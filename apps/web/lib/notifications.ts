export type NotificationEntityType = "TASK" | "DEAL" | "CONTACT" | "COMPANY" | "INVITATION";

export interface NotificationPayload {
  taskId?: string;
  dealId?: string;
  companyId?: string;
  contactId?: string;
  title?: string;
  name?: string;
  companyName?: string;
  fromStage?: string;
  toStage?: string;
  stageHistoryId?: string;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string | null;
  message: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
  href: string;
}

export interface NotificationList {
  items: NotificationItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function notificationHref(input: {
  entityType?: string | null;
  entityId?: string | null;
  payload?: NotificationPayload | null;
} | NotificationPayload | null | undefined) {
  if (!input) return "/notifications";
  const entityType = "entityType" in input ? input.entityType : undefined;
  const entityId = "entityId" in input ? input.entityId : undefined;
  const payload = "payload" in input ? input.payload : (input as NotificationPayload);
  if (entityType === "TASK" && entityId) return `/tasks/${entityId}`;
  if (entityType === "DEAL" && entityId) return `/deals/${entityId}`;
  if (entityType === "CONTACT" && entityId) return `/contacts/${entityId}`;
  if (entityType === "COMPANY" && entityId) return `/companies/${entityId}`;
  if (payload?.taskId) return `/tasks/${payload.taskId}`;
  if (payload?.dealId) return `/deals/${payload.dealId}`;
  if (payload?.contactId) return `/contacts/${payload.contactId}`;
  if (payload?.companyId) return `/companies/${payload.companyId}`;
  return "/notifications";
}

export function notificationCopy(type: string, payload: NotificationPayload | null | undefined) {
  const name = payload?.title ?? payload?.name ?? "a record";
  if (type === "TASK_REMINDER") return { heading: "Upcoming task", body: `"${name}" is due soon.` };
  if (type === "FOLLOW_UP_OVERDUE") return { heading: "Task overdue", body: `"${name}" is overdue.` };
  if (type === "TASK_ASSIGNED") return { heading: "New task assigned", body: `"${name}" was assigned to you.` };
  if (type === "DEAL_ASSIGNED" || type === "LEAD_ASSIGNED") {
    const company = payload?.companyName ? ` (${payload.companyName})` : "";
    return { heading: "Deal assigned", body: `"${name}"${company} was assigned to you.` };
  }
  if (type === "DEAL_WON") return { heading: "Deal won", body: `"${name}" was marked as won.` };
  if (type === "DEAL_LOST") return { heading: "Deal lost", body: `"${name}" was marked as lost.` };
  if (type === "DEAL_STAGE_CHANGED") {
    const heading = payload?.toStage === "Negotiation" ? "Deal moved to Negotiation" : "Deal stage changed";
    const body =
      payload?.fromStage && payload?.toStage
        ? `"${name}" moved from ${payload.fromStage} to ${payload.toStage}.`
        : `"${name}" changed stage.`;
    return { heading, body };
  }
  if (type === "TEAM_MEMBER_JOINED") return { heading: "Team member joined", body: "A teammate accepted their invitation." };
  if (type === "MEMBER_ROLE_CHANGED") return { heading: "Role updated", body: "Your organization role was changed." };
  return { heading: "Notification", body: name };
}

export function displayNotification(row: Pick<NotificationItem, "type" | "title" | "message" | "entityType" | "entityId" | "payload" | "href">) {
  const copy = notificationCopy(row.type, row.payload);
  return {
    heading: row.title || copy.heading,
    body: row.message || copy.body,
    href: row.href || notificationHref({ entityType: row.entityType, entityId: row.entityId, payload: row.payload }),
  };
}

export function relativeTime(iso: string, now = new Date()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const delta = Math.max(0, now.getTime() - then);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

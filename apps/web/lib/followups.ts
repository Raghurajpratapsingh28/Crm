export const ACTIVITY_TYPES = ["CALL", "EMAIL", "MEETING", "NOTE", "STATUS_CHANGE"] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<string, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
  STATUS_CHANGE: "Status Change",
};

export interface ActivityRecord {
  id: string;
  type: string;
  content: string | null;
  occurredAt: string;
  createdAt: string;
  metadata?: { fromStageName?: string; toStageName?: string; durationMinutes?: number; direction?: string } | null;
  author?: { id: string; fullName: string };
  deal?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  company?: { id: string; name: string } | null;
  followUpTask?: TaskRecord | null;
}

export interface TaskRecord {
  id: string;
  title: string;
  description?: string | null;
  status: "OPEN" | "DONE";
  dueDate: string | null;
  completedAt?: string | null;
  isOverdue: boolean;
  assigneeId: string;
  createdById?: string;
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
  assignee?: { id: string; fullName: string };
  creator?: { id: string; fullName: string };
  deal?: { id: string; name: string } | null;
  contact?: { id: string; firstName: string; lastName: string } | null;
  company?: { id: string; name: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export function activityLabel(type: string) {
  return ACTIVITY_LABELS[type] ?? type;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayGroupLabel(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - target.getTime()) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function groupActivitiesByDay(items: ActivityRecord[], now = new Date()) {
  const groups: Array<{ label: string; items: ActivityRecord[] }> = [];
  for (const item of items) {
    const label = dayGroupLabel(item.occurredAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export function relatedLabel(row: { deal?: { name: string } | null; company?: { name: string } | null; contact?: { firstName: string; lastName: string } | null }) {
  return [row.company?.name, row.deal?.name, row.contact ? `${row.contact.firstName} ${row.contact.lastName}` : null]
    .filter(Boolean)
    .join(" · ");
}

export function dueLabel(task: Pick<TaskRecord, "dueDate" | "isOverdue" | "status">) {
  if (!task.dueDate) return "No due date";
  const date = new Date(task.dueDate);
  const text = date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  if (task.status === "OPEN" && task.isOverdue) return `Overdue · ${text}`;
  return `Due ${text}`;
}

export function toDateTimeLocal(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDateTimeLocal(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function dayBounds(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function upcomingBounds(now = new Date(), days = 7) {
  const to = new Date(now);
  to.setDate(to.getDate() + days);
  return { from: now.toISOString(), to: to.toISOString() };
}

export { notificationCopy, notificationHref } from "./notifications";

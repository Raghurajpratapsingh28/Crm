import type { ActivityType, Prisma, TaskStatus } from "@prisma/client";
import { fail, invalid } from "../utils/errors.js";
import { contains, normalizeNotes, parseOptionalUuid, requiredName } from "./crm.js";

export const ACTIVITY_TYPES: ActivityType[] = ["CALL", "EMAIL", "MEETING", "NOTE", "STATUS_CHANGE"];
export const MANUAL_ACTIVITY_TYPES: ActivityType[] = ["CALL", "EMAIL", "MEETING", "NOTE"];

export const ACTIVITY_SORT: Record<string, keyof Prisma.ActivityOrderByWithRelationInput> = {
  occurredAt: "occurredAt",
  occurred_at: "occurredAt",
  createdAt: "createdAt",
  created_at: "createdAt",
};

export const TASK_SORT: Record<string, keyof Prisma.TaskOrderByWithRelationInput> = {
  dueDate: "dueDate",
  due_date: "dueDate",
  createdAt: "createdAt",
  created_at: "createdAt",
  updatedAt: "updatedAt",
  updated_at: "updatedAt",
  title: "title",
};

const METADATA_MAX = 4000;

export function parseActivityType(value: unknown, { allowStatusChange = false } = {}) {
  const type = String(value ?? "").trim().toUpperCase() as ActivityType;
  if (!ACTIVITY_TYPES.includes(type)) throw fail(400, "INVALID_ACTIVITY_TYPE", "activity type is invalid");
  if (type === "STATUS_CHANGE" && !allowStatusChange) {
    throw fail(400, "INVALID_ACTIVITY_TYPE", "STATUS_CHANGE activities are created by the system");
  }
  return type;
}

export function parseActivityContent(type: ActivityType, value: unknown) {
  const content = normalizeNotes(value);
  if (MANUAL_ACTIVITY_TYPES.includes(type) && !content) {
    throw invalid("content is required");
  }
  return content ?? null;
}

export function parseOccurredAt(value: unknown): Date {
  if (value === undefined || value === null || value === "") return new Date();
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw invalid("occurredAt must be a valid date");
  return date;
}

export function parseDueDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw fail(400, "INVALID_DUE_DATE", "dueDate must be a valid date");
  return date;
}

export function parseActivityMetadata(type: ActivityType, value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw invalid("metadata must be an object");
  const raw = JSON.stringify(value);
  if (raw.length > METADATA_MAX) throw invalid("metadata is too large");
  const meta = value as Record<string, unknown>;
  if (type === "CALL" && meta.durationMinutes !== undefined) {
    const minutes = Number(meta.durationMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 24 * 60) {
      throw invalid("durationMinutes must be a valid number of minutes");
    }
  }
  if (type === "EMAIL" && meta.direction !== undefined) {
    const direction = String(meta.direction).toUpperCase();
    if (direction !== "INBOUND" && direction !== "OUTBOUND") throw invalid("email direction is invalid");
  }
  return meta as Prisma.InputJsonValue;
}

export function activitySearchWhere(search: string): Prisma.ActivityWhereInput["OR"] {
  return [
    { content: contains(search) },
    { deal: { name: contains(search) } },
    { company: { name: contains(search) } },
    { contact: { firstName: contains(search) } },
    { contact: { lastName: contains(search) } },
    { author: { fullName: contains(search) } },
  ];
}

export function taskSearchWhere(search: string): Prisma.TaskWhereInput["OR"] {
  return [
    { title: contains(search) },
    { description: contains(search) },
    { deal: { name: contains(search) } },
    { company: { name: contains(search) } },
    { contact: { firstName: contains(search) } },
    { contact: { lastName: contains(search) } },
  ];
}

export function parseActivityFilters(query: Record<string, unknown>) {
  return {
    type: query.type ? parseActivityType(query.type, { allowStatusChange: true }) : undefined,
    dealId: parseOptionalUuid(query.dealId ?? query.deal, "dealId"),
    contactId: parseOptionalUuid(query.contactId ?? query.contact, "contactId"),
    companyId: parseOptionalUuid(query.companyId ?? query.company, "companyId"),
    authorId: parseOptionalUuid(query.authorId ?? query.author, "authorId"),
    occurredFrom: query.occurredFrom ? new Date(String(query.occurredFrom)) : undefined,
    occurredTo: query.occurredTo ? new Date(String(query.occurredTo)) : undefined,
    search: String(query.search ?? "").trim(),
  };
}

export function parseTaskFilters(query: Record<string, unknown>) {
  const status = query.status ? String(query.status).toUpperCase() : "";
  return {
    status: status === "OPEN" || status === "DONE" ? (status as TaskStatus) : undefined,
    assigneeId: parseOptionalUuid(query.assigneeId ?? query.assignee, "assigneeId"),
    dealId: parseOptionalUuid(query.dealId ?? query.deal, "dealId"),
    contactId: parseOptionalUuid(query.contactId ?? query.contact, "contactId"),
    companyId: parseOptionalUuid(query.companyId ?? query.company, "companyId"),
    dueDateFrom: query.dueDateFrom ? new Date(String(query.dueDateFrom)) : undefined,
    dueDateTo: query.dueDateTo || query.dueBefore ? new Date(String(query.dueDateTo ?? query.dueBefore)) : undefined,
    overdue: String(query.overdue ?? "") === "true",
    search: String(query.search ?? "").trim(),
  };
}

export function parseTaskTitle(value: unknown) {
  return requiredName(value, "title");
}

export function reminderDedupeKey(taskId: string, dueDate: Date) {
  return `TASK_REMINDER:${taskId}:${dueDate.toISOString()}`;
}

export function overdueDedupeKey(taskId: string, now: Date) {
  return `TASK_OVERDUE:${taskId}:${now.toISOString().slice(0, 10)}`;
}

export function isTaskOverdue(status: string, dueDate: Date | null | undefined, now = new Date()) {
  return status === "OPEN" && Boolean(dueDate) && dueDate!.getTime() < now.getTime();
}

import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { canAssignResource } from "../services/authorization.service.js";
import { fail, invalid } from "../utils/errors.js";

export const MAX_PAGE_LIMIT = 100;
export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 32;
export const MAX_NOTES_LENGTH = 5000;
export const MAX_NAME_LENGTH = 200;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CONTACT_SOURCES = [
  "REFERRAL",
  "WEBSITE",
  "COLD_OUTREACH",
  "EVENT",
  "SOCIAL",
  "PARTNER",
  "OTHER",
] as const;

export type ContactSourceValue = (typeof CONTACT_SOURCES)[number];

export type SortOrder = Prisma.SortOrder;

export function parsePagination(query: Record<string, unknown>) {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.min(MAX_PAGE_LIMIT, Math.floor(rawLimit))
    : DEFAULT_PAGE_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit) || 1),
  };
}

export function parseSortOrder(value: unknown): SortOrder {
  return String(value ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
}

export function whitelistSort<T extends string>(
  value: unknown,
  allowed: Record<string, T>,
  fallback: T,
): T {
  const key = String(value ?? "").trim();
  return allowed[key] ?? fallback;
}

export function optionalString(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw invalid(`must be at most ${max} characters`);
  return trimmed;
}

export function requiredName(value: unknown, field = "name") {
  const name = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw invalid(`${field} is required`);
  if (name.length > MAX_NAME_LENGTH) throw invalid(`${field} is too long`);
  return name;
}

export function normalizeEmail(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const email = String(value).trim().toLowerCase();
  if (!email) return null;
  if (!EMAIL.test(email) || email.length > 254) {
    throw fail(400, "INVALID_CONTACT", "email must be a valid email address");
  }
  return email;
}

export function normalizePhone(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const compact = raw.replace(/[()\s.-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(compact)) {
    throw fail(400, "INVALID_CONTACT", "phone must be 7-15 digits, optionally in E.164 form");
  }
  return compact.startsWith("+") ? compact : compact;
}

export function normalizeWebsite(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw fail(400, "INVALID_COMPANY", "website must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw fail(400, "INVALID_COMPANY", "website must be a valid URL");
  }
  if (!parsed.hostname.includes(".")) {
    throw fail(400, "INVALID_COMPANY", "website must be a valid URL");
  }
  return parsed.toString();
}

export function parseEmployeeCount(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw fail(400, "INVALID_COMPANY", "employeeCount must be an integer greater than or equal to 0");
  }
  if (n > 10_000_000) throw fail(400, "INVALID_COMPANY", "employeeCount is too large");
  return n;
}

export function normalizeTags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) throw invalid("tags must be an array of strings");
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of value) {
    const tag = String(item ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > MAX_TAG_LENGTH) throw invalid(`tags must be at most ${MAX_TAG_LENGTH} characters`);
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
    if (tags.length > MAX_TAGS) throw invalid(`at most ${MAX_TAGS} tags are allowed`);
  }
  return tags;
}

export function normalizeNotes(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const notes = String(value).trim();
  if (!notes) return null;
  if (notes.length > MAX_NOTES_LENGTH) throw invalid(`notes must be at most ${MAX_NOTES_LENGTH} characters`);
  return notes;
}

export function parseContactSource(value: unknown): ContactSourceValue | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const source = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_") as ContactSourceValue;
  if (!CONTACT_SOURCES.includes(source)) {
    throw fail(400, "INVALID_CONTACT", "source is invalid");
  }
  return source;
}

export function parseOptionalUuid(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const id = String(value).trim();
  if (!UUID.test(id)) throw invalid(`${field} is invalid`);
  return id;
}

export function parseRequiredUuid(value: unknown, field: string) {
  const id = parseOptionalUuid(value, field);
  if (!id) throw invalid(`${field} is required`);
  return id;
}

export function parseDateBound(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw invalid(`${field} must be a valid date`);
  return date;
}

export function contains(value: string): Prisma.StringFilter {
  return { contains: value, mode: "insensitive" };
}

export async function resolveOwnerId(input: {
  organizationId: string;
  actorId: string;
  role: Role;
  requestedOwnerId?: string | null;
}) {
  const requested = input.requestedOwnerId ?? undefined;
  if (!canAssignResource(input.role) || !requested) {
    return input.actorId;
  }
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: requested,
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  if (!member) {
    throw fail(400, "INVALID_OWNER", "owner must be an active member of this organization");
  }
  return member.userId;
}

export async function resolveAssigneeId(input: {
  organizationId: string;
  actorId: string;
  role: Role;
  requestedAssigneeId?: string | null;
}) {
  const requested = input.requestedAssigneeId ?? undefined;
  if (!requested || requested === input.actorId) return input.actorId;
  if (!canAssignResource(input.role)) {
    throw fail(403, "INSUFFICIENT_PERMISSION", "you cannot assign tasks to other users");
  }
  const member = await prisma.organizationMember.findFirst({
    where: {
      organizationId: input.organizationId,
      userId: requested,
      status: "ACTIVE",
    },
    select: { userId: true },
  });
  if (!member) {
    throw fail(400, "INVALID_TASK_ASSIGNEE", "assignee must be an active member of this organization");
  }
  return member.userId;
}

export function isUniqueConstraint(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

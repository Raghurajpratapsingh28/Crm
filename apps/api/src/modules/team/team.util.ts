import type { Department, MemberStatus, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { invalid } from "../../utils/errors.js";

export const ROLES: Role[] = ["ADMIN", "MANAGER", "MEMBER"];
export const DEPARTMENTS: Department[] = ["SALES", "MARKETING", "MANAGEMENT", "OTHER"];
export const MEMBER_STATUSES: MemberStatus[] = ["INVITED", "ACTIVE", "DEACTIVATED"];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!email || !EMAIL.test(email)) {
    throw invalid("email is required and must be valid");
  }
  return email;
}

export function parseRole(value: unknown, fallback?: Role): Role {
  if (value === undefined || value === "") {
    if (fallback) return fallback;
    throw invalid("role is invalid");
  }
  const role = String(value).trim().toUpperCase() as Role;
  if (!ROLES.includes(role)) throw invalid("role is invalid");
  return role;
}

export function parseDepartment(value: unknown): Department | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_") as Department;
  if (!DEPARTMENTS.includes(normalized)) {
    throw invalid("department must be SALES, MARKETING, MANAGEMENT, or OTHER");
  }
  return normalized;
}

export function parseStatus(value: unknown): MemberStatus | undefined {
  if (value === undefined || value === "") return undefined;
  const status = String(value).trim().toUpperCase() as MemberStatus;
  if (!MEMBER_STATUSES.includes(status)) throw invalid("status is invalid");
  return status;
}

export function parseListQuery(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const search = String(query.search ?? "").trim();
  const sort = String(query.sort ?? "createdAt");
  const order = String(query.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  return { page, limit, search, sort, order, skip: (page - 1) * limit };
}

export async function activeAdminCount(
  organizationId: string,
  db: { organizationMember: { count: typeof prisma.organizationMember.count } },
) {
  return db.organizationMember.count({
    where: { organizationId, role: "ADMIN", status: "ACTIVE" },
  });
}

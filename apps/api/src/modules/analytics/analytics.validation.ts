import type { AnalyticsGroupBy, AnalyticsLeaderboardSort, Department, Role } from "@crm/types";
import { PERMISSIONS } from "@crm/types";
import { prisma } from "../../lib/prisma.js";
import { parseOptionalUuid } from "../../lib/crm.js";
import {
  addCalendarDays,
  inclusiveDayCount,
  previousEqualRange,
  resolveTimeZone,
  thisMonthRange,
  zonedEndExclusiveUtc,
  zonedStartUtc,
} from "../../lib/analytics-timezone.js";
import { hasPermission } from "../../services/permission.service.js";
import { fail, forbidden } from "../../utils/errors.js";

const DEPARTMENTS: Department[] = ["SALES", "MARKETING", "MANAGEMENT", "OTHER"];
const MAX_RANGE_DAYS = 366 * 15;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export type AnalyticsActor = {
  organizationId: string;
  userId: string;
  role: Role;
};

export type ResolvedAnalyticsFilters = {
  fromYmd: string;
  toYmd: string;
  exclusiveToYmd: string;
  fromUtc: Date;
  toUtc: Date;
  timeZone: string;
  orgCurrency: string;
  ownerId?: string;
  department?: Department;
  pipelineId?: string;
  groupBy: AnalyticsGroupBy;
  sortBy: AnalyticsLeaderboardSort;
  previous: {
    fromYmd: string;
    toYmd: string;
    exclusiveToYmd: string;
    fromUtc: Date;
    toUtc: Date;
  };
};

function parseYmd(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const raw = String(value).trim().slice(0, 10);
  const match = YMD.exec(raw);
  if (!match) throw fail(400, "INVALID_DATE_RANGE", `${field} must be YYYY-MM-DD`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw fail(400, "INVALID_DATE_RANGE", `${field} is not a valid calendar date`);
  }
  return raw;
}

function parseDepartmentFilter(value: unknown): Department | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = String(value).trim().toUpperCase().replace(/[\s-]+/g, "_") as Department;
  if (!DEPARTMENTS.includes(normalized)) {
    throw fail(400, "INVALID_TEAM", "team must be a department: SALES, MARKETING, MANAGEMENT, or OTHER");
  }
  return normalized;
}

function parseGroupBy(value: unknown): AnalyticsGroupBy {
  const raw = String(value ?? "month").trim().toLowerCase();
  if (raw === "day" || raw === "week" || raw === "month") return raw;
  throw fail(400, "INVALID", "groupBy must be day, week, or month");
}

function parseSortBy(value: unknown): AnalyticsLeaderboardSort {
  const raw = String(value ?? "revenue").trim();
  if (raw === "revenue") return "revenue";
  if (raw === "dealsWon" || raw === "deals_won") return "dealsWon";
  if (raw === "openPipeline" || raw === "open_pipeline") return "openPipeline";
  throw fail(400, "INVALID", "sortBy must be revenue, dealsWon, or openPipeline");
}

export async function resolveAnalyticsFilters(
  actor: AnalyticsActor,
  query: Record<string, unknown>,
): Promise<ResolvedAnalyticsFilters> {
  const organization = await prisma.organization.findUnique({
    where: { id: actor.organizationId },
    select: { timezone: true, currency: true },
  });
  if (!organization) throw fail(404, "NOT_FOUND", "Organization not found");

  const timeZone = resolveTimeZone(organization.timezone);
  const defaults = thisMonthRange(timeZone);
  const fromYmd = parseYmd(query.from, "from") ?? defaults.from;
  const toYmd = parseYmd(query.to, "to") ?? defaults.to;
  if (fromYmd > toYmd) throw fail(400, "INVALID_DATE_RANGE", "from must be on or before to");
  if (inclusiveDayCount(fromYmd, toYmd) > MAX_RANGE_DAYS) {
    throw fail(400, "INVALID_DATE_RANGE", "date range is too large");
  }

  const exclusiveToYmd = addCalendarDays(toYmd, 1);
  const fromUtc = zonedStartUtc(fromYmd, timeZone);
  const toUtc = zonedEndExclusiveUtc(toYmd, timeZone);
  const previousRange = previousEqualRange(fromYmd, toYmd);
  const previousExclusive = addCalendarDays(previousRange.to, 1);

  const ownerId = parseOptionalUuid(query.ownerId ?? query.owner, "ownerId") ?? undefined;
  const pipelineId = parseOptionalUuid(query.pipelineId ?? query.pipeline, "pipelineId") ?? undefined;
  const department = parseDepartmentFilter(query.teamId ?? query.department ?? query.team);

  if (department && !hasPermission(actor.role, PERMISSIONS.ANALYTICS_TEAM)) {
    throw forbidden("You do not have permission to view team analytics");
  }

  if (ownerId) {
    const member = await prisma.organizationMember.findFirst({
      where: { organizationId: actor.organizationId, userId: ownerId },
      select: { userId: true },
    });
    if (!member) throw fail(400, "INVALID_OWNER", "owner must belong to this organization");
    if (actor.role === "MEMBER" && ownerId !== actor.userId) {
      throw fail(400, "INVALID_OWNER", "owner must belong to this organization");
    }
  }

  if (pipelineId) {
    const pipeline = await prisma.pipeline.findFirst({
      where: { organizationId: actor.organizationId, id: pipelineId },
      select: { id: true },
    });
    if (!pipeline) throw fail(404, "PIPELINE_NOT_FOUND", "Pipeline not found");
  }

  return {
    fromYmd,
    toYmd,
    exclusiveToYmd,
    fromUtc,
    toUtc,
    timeZone,
    orgCurrency: organization.currency,
    ownerId: ownerId || undefined,
    department,
    pipelineId: pipelineId || undefined,
    groupBy: parseGroupBy(query.groupBy),
    sortBy: parseSortBy(query.sortBy ?? query.sort),
    previous: {
      fromYmd: previousRange.from,
      toYmd: previousRange.to,
      exclusiveToYmd: previousExclusive,
      fromUtc: zonedStartUtc(previousRange.from, timeZone),
      toUtc: zonedEndExclusiveUtc(previousRange.to, timeZone),
    },
  };
}

export function periodDto(filters: Pick<ResolvedAnalyticsFilters, "fromYmd" | "toYmd" | "exclusiveToYmd" | "timeZone">) {
  return {
    from: filters.fromYmd,
    to: filters.toYmd,
    exclusiveTo: filters.exclusiveToYmd,
    timeZone: filters.timeZone,
  };
}

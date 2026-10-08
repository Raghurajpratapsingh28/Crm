import type {
  AnalyticsActivity,
  AnalyticsGroupBy,
  AnalyticsLeaderboard,
  AnalyticsOverview,
  AnalyticsPipeline,
  AnalyticsRevenue,
  AnalyticsWinRate,
  MoneyAmount,
} from "@crm/types";
import { formatMoney } from "./deals";

export type {
  AnalyticsActivity,
  AnalyticsGroupBy,
  AnalyticsLeaderboard,
  AnalyticsOverview,
  AnalyticsPipeline,
  AnalyticsRevenue,
  AnalyticsWinRate,
  MoneyAmount,
};

export interface AnalyticsQuery {
  from: string;
  to: string;
  ownerId?: string;
  teamId?: string;
  pipelineId?: string;
  groupBy?: AnalyticsGroupBy;
  sortBy?: string;
}

export function analyticsSearch(query: AnalyticsQuery) {
  const search = new URLSearchParams();
  if (query.from) search.set("from", query.from);
  if (query.to) search.set("to", query.to);
  if (query.ownerId) search.set("ownerId", query.ownerId);
  if (query.teamId) search.set("teamId", query.teamId);
  if (query.pipelineId) search.set("pipelineId", query.pipelineId);
  if (query.groupBy) search.set("groupBy", query.groupBy);
  if (query.sortBy) search.set("sortBy", query.sortBy);
  return search;
}

export function filtersFromParams(params: URLSearchParams): {
  from: string;
  to: string;
  owner: string;
  team: string;
  pipeline: string;
  groupBy: string;
  sort: string;
} {
  return {
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    owner: params.get("owner") ?? "",
    team: params.get("team") ?? "",
    pipeline: params.get("pipeline") ?? "",
    groupBy: params.get("groupBy") ?? "month",
    sort: params.get("sort") ?? "revenue",
  };
}

export function queryFromUrlFilters(filters: ReturnType<typeof filtersFromParams>): AnalyticsQuery {
  return {
    from: filters.from,
    to: filters.to,
    ownerId: filters.owner || undefined,
    teamId: filters.team || undefined,
    pipelineId: filters.pipeline || undefined,
    groupBy: (filters.groupBy as AnalyticsGroupBy) || "month",
    sortBy: filters.sort || "revenue",
  };
}

export function chartNumber(value: string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function formatMoneyMetric(metric: Pick<MoneyAmount, "amount" | "currency" | "mixed"> | null | undefined) {
  if (!metric) return "—";
  if (metric.mixed) return "Multiple currencies";
  return formatMoney(metric.amount, metric.currency);
}

export function formatWinRate(value: number, hasData: boolean) {
  if (!hasData) return "No closed deals";
  return `${value.toFixed(1)}%`;
}

export function formatTrend(percent: number | null, hasComparison: boolean) {
  if (!hasComparison || percent === null || !Number.isFinite(percent)) return null;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(1)}%`;
}

export function activityHeadline(item: AnalyticsActivity) {
  const who = item.author.fullName;
  const target = item.deal?.name ?? item.company?.name ?? (item.contact ? `${item.contact.firstName} ${item.contact.lastName}` : "a record");
  if (item.type === "STATUS_CHANGE") {
    const meta = item.metadata as { fromStageName?: string; toStageName?: string } | null;
    if (meta?.toStageName) return `${who} moved ${item.deal?.name ?? "a deal"} to ${meta.toStageName}`;
    return item.content ?? `${who} updated ${target}`;
  }
  const verbs: Record<string, string> = {
    CALL: "called",
    EMAIL: "emailed",
    MEETING: "met about",
    NOTE: "noted",
  };
  return `${who} ${verbs[item.type] ?? "logged"} ${target}`;
}

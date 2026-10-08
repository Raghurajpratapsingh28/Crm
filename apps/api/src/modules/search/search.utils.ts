import type { ActivityType } from "@prisma/client";
import {
  SEARCH_MAX_LIMIT,
  type GlobalSearchResult,
  type SearchQueryType,
  type SearchResultType,
} from "@crm/types";

export const RANK_EXACT = 1;
export const RANK_PREFIX = 2;
export const RANK_PARTIAL = 3;
export const RANK_NONE = 99;

const ACTIVITY_TYPE_ALIASES: Record<string, ActivityType> = {
  call: "CALL",
  email: "EMAIL",
  meeting: "MEETING",
  note: "NOTE",
  status_change: "STATUS_CHANGE",
};

export function normalizeSearchQuery(value: unknown): string {
  return String(value ?? "")
    .replace(/[%_\\]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function matchRank(haystack: string | null | undefined, needle: string): number {
  if (!haystack || !needle) return RANK_NONE;
  const h = haystack.trim().toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!h) return RANK_NONE;
  if (h === n) return RANK_EXACT;
  if (h.startsWith(n)) return RANK_PREFIX;
  if (h.includes(n)) return RANK_PARTIAL;
  return RANK_NONE;
}

export function bestRank(fields: Array<string | null | undefined>, needle: string): number {
  let best = RANK_NONE;
  for (const field of fields) {
    const rank = matchRank(field, needle);
    if (rank < best) best = rank;
  }
  return best;
}

export function matchingActivityType(query: string): ActivityType | undefined {
  const key = query.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ACTIVITY_TYPE_ALIASES[key];
}

export function sortSearchHits<T extends { relevance: number; timestamp?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.relevance !== b.relevance) return a.relevance - b.relevance;
    const at = a.timestamp ? Date.parse(a.timestamp) : 0;
    const bt = b.timestamp ? Date.parse(b.timestamp) : 0;
    return bt - at;
  });
}

const GROUP_ORDER: SearchResultType[] = ["contact", "company", "deal", "activity"];

export function takeTopResults(
  items: GlobalSearchResult[],
  limit: number,
  type: SearchQueryType,
): GlobalSearchResult[] {
  const ranked = sortSearchHits(items);
  const cap = Math.min(SEARCH_MAX_LIMIT, Math.max(0, limit));
  if (type !== "all") {
    const wanted: SearchResultType = type === "contacts" ? "contact" : type === "companies" ? "company" : type === "deals" ? "deal" : "activity";
    return ranked.filter((item) => item.type === wanted).slice(0, cap);
  }
  return ranked.slice(0, cap);
}

export function groupSearchResults(items: GlobalSearchResult[]) {
  const results = {
    contacts: [] as GlobalSearchResult[],
    companies: [] as GlobalSearchResult[],
    deals: [] as GlobalSearchResult[],
    activities: [] as GlobalSearchResult[],
  };
  for (const type of GROUP_ORDER) {
    const bucket =
      type === "contact" ? results.contacts : type === "company" ? results.companies : type === "deal" ? results.deals : results.activities;
    for (const item of items) {
      if (item.type === type) bucket.push(item);
    }
  }
  return results;
}

export function perTypeTake(limit: number) {
  return Math.min(SEARCH_MAX_LIMIT, Math.max(limit, 1));
}

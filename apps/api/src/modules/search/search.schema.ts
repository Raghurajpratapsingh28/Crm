import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_MAX_QUERY_LENGTH,
  SEARCH_QUERY_TYPES,
  type SearchQueryType,
} from "@crm/types";
import { invalid } from "../../utils/errors.js";
import { normalizeSearchQuery } from "./search.utils.js";

export function parseSearchQuery(query: Record<string, unknown>) {
  const q = normalizeSearchQuery(query.q);
  if (!q) {
    throw invalid("q is required");
  }
  if (q.length > SEARCH_MAX_QUERY_LENGTH) {
    throw invalid(`q must be at most ${SEARCH_MAX_QUERY_LENGTH} characters`);
  }

  const rawType = query.type === undefined || query.type === "" ? "all" : String(query.type).trim().toLowerCase();
  if (!SEARCH_QUERY_TYPES.includes(rawType as SearchQueryType)) {
    throw invalid("type must be all, contacts, companies, deals, or activities");
  }
  const type = rawType as SearchQueryType;

  let limit = SEARCH_DEFAULT_LIMIT;
  if (query.limit !== undefined && query.limit !== "") {
    const raw = Number(query.limit);
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 1) {
      throw invalid("limit must be a positive integer");
    }
    if (raw > SEARCH_MAX_LIMIT) {
      throw invalid(`limit must be at most ${SEARCH_MAX_LIMIT}`);
    }
    limit = raw;
  }

  return { q, type, limit };
}

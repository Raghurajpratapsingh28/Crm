import { describe, expect, it } from "vitest";
import { SEARCH_MAX_LIMIT } from "@crm/types";
import { parseSearchQuery } from "./search.schema.js";
import {
  bestRank,
  groupSearchResults,
  matchingActivityType,
  matchRank,
  normalizeSearchQuery,
  RANK_EXACT,
  RANK_NONE,
  RANK_PARTIAL,
  RANK_PREFIX,
  takeTopResults,
} from "./search.utils.js";

describe("search utils", () => {
  it("normalizes whitespace and strips ILIKE wildcards", () => {
    expect(normalizeSearchQuery("   John   Doe   ")).toBe("John Doe");
    expect(normalizeSearchQuery("100%_off")).toBe("100off");
  });

  it("ranks exact, prefix, then partial", () => {
    expect(matchRank("Acme", "acme")).toBe(RANK_EXACT);
    expect(matchRank("Acme Labs", "acme")).toBe(RANK_PREFIX);
    expect(matchRank("North Acme", "acme")).toBe(RANK_PARTIAL);
    expect(matchRank("Globex", "acme")).toBe(RANK_NONE);
    expect(bestRank(["North Acme", "Acme"], "acme")).toBe(RANK_EXACT);
  });

  it("maps activity type aliases", () => {
    expect(matchingActivityType("call")).toBe("CALL");
    expect(matchingActivityType("Status Change")).toBe("STATUS_CHANGE");
    expect(matchingActivityType("called")).toBeUndefined();
  });

  it("takes the globally best matches so a weaker group cannot starve an exact hit", () => {
    const items = [
      { id: "c1", type: "contact" as const, title: "partial", href: "/c/1", relevance: RANK_PARTIAL, timestamp: "2026-01-02T00:00:00.000Z" },
      { id: "c2", type: "contact" as const, title: "partial 2", href: "/c/2", relevance: RANK_PARTIAL, timestamp: "2026-01-03T00:00:00.000Z" },
      { id: "co1", type: "company" as const, title: "exact", href: "/co/1", relevance: RANK_EXACT, timestamp: "2026-01-01T00:00:00.000Z" },
    ];
    const top = takeTopResults(items, 2, "all");
    expect(top.map((row) => row.id)).toEqual(["co1", "c2"]);
    expect(groupSearchResults(top).companies).toHaveLength(1);
    expect(groupSearchResults(top).contacts).toHaveLength(1);
  });

  it("never returns more than the configured maximum", () => {
    const items = Array.from({ length: 80 }, (_, i) => ({
      id: String(i),
      type: "contact" as const,
      title: `n${i}`,
      href: `/c/${i}`,
      relevance: RANK_PARTIAL,
      timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
    expect(takeTopResults(items, SEARCH_MAX_LIMIT, "contacts")).toHaveLength(SEARCH_MAX_LIMIT);
  });
});

describe("parseSearchQuery", () => {
  it("defaults type and limit", () => {
    expect(parseSearchQuery({ q: "  john  " })).toEqual({ q: "john", type: "all", limit: 20 });
  });

  it("rejects empty, oversized, and invalid parameters", () => {
    expect(() => parseSearchQuery({ q: "   " })).toThrow(/q is required/);
    expect(() => parseSearchQuery({ q: "a".repeat(101) })).toThrow(/at most 100/);
    expect(() => parseSearchQuery({ q: "john", type: "tasks" })).toThrow(/type must be/);
    expect(() => parseSearchQuery({ q: "john", limit: "-1" })).toThrow(/positive integer/);
    expect(() => parseSearchQuery({ q: "john", limit: "0" })).toThrow(/positive integer/);
    expect(() => parseSearchQuery({ q: "john", limit: "abc" })).toThrow(/positive integer/);
    expect(() => parseSearchQuery({ q: "john", limit: "51" })).toThrow(/at most 50/);
  });

  it("ignores organizationId from the client", () => {
    const parsed = parseSearchQuery({ q: "john", organizationId: "should-not-matter" });
    expect(parsed).toEqual({ q: "john", type: "all", limit: 20 });
  });
});

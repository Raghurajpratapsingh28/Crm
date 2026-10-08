import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  enumeratePeriods,
  isoWeekLabel,
  previousEqualRange,
  thisMonthRange,
  zonedEndExclusiveUtc,
  zonedStartUtc,
} from "./analytics-timezone.js";
import { collapseCurrencies, moneyString, trendPercent, winRate } from "./analytics-math.js";

describe("analytics timezone", () => {
  it("maps Asia/Kolkata calendar days to half-open UTC instants", () => {
    expect(zonedStartUtc("2026-09-01", "Asia/Kolkata").toISOString()).toBe("2026-08-31T18:30:00.000Z");
    expect(zonedEndExclusiveUtc("2026-09-30", "Asia/Kolkata").toISOString()).toBe("2026-09-30T18:30:00.000Z");
  });

  it("maps America/New_York midnight including a DST night", () => {
    expect(zonedStartUtc("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("builds this-month and previous equal-length ranges", () => {
    const month = thisMonthRange("UTC", new Date("2026-09-20T12:00:00.000Z"));
    expect(month).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousEqualRange("2026-09-01", "2026-09-30")).toEqual({ from: "2026-08-02", to: "2026-08-31" });
    expect(addCalendarDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("enumerates ISO weeks matching PostgreSQL IYYY-W IW", () => {
    expect(isoWeekLabel("2026-01-01")).toBe("2026-W01");
    expect(isoWeekLabel("2025-12-29")).toBe("2026-W01");
    expect(enumeratePeriods("2026-01-01", "2026-03-31", "month")).toEqual(["2026-01", "2026-02", "2026-03"]);
  });
});

describe("analytics math", () => {
  it("preserves two decimal places", () => {
    expect(moneyString("100000.50")).toBe("100000.50");
    expect(moneyString("100000.5")).toBe("100000.50");
  });

  it("computes win rate and zero-data", () => {
    expect(winRate(20, 30)).toEqual({ value: 40, hasData: true, won: 20, lost: 30 });
    expect(winRate(10, 10)).toEqual({ value: 50, hasData: true, won: 10, lost: 10 });
    expect(winRate(0, 10)).toEqual({ value: 0, hasData: true, won: 0, lost: 10 });
    expect(winRate(10, 0)).toEqual({ value: 100, hasData: true, won: 10, lost: 0 });
    expect(winRate(0, 0)).toEqual({ value: 0, hasData: false, won: 0, lost: 0 });
  });

  it("does not invent infinite trends", () => {
    expect(trendPercent("120000", "100000")).toEqual({ percent: 20, hasComparison: true });
    expect(trendPercent("120000", "0")).toEqual({ percent: null, hasComparison: false });
  });

  it("does not sum mixed currencies", () => {
    const mixed = collapseCurrencies(
      [
        { currency: "INR", amount: "1250000" },
        { currency: "USD", amount: "5000" },
      ],
      "INR",
    );
    expect(mixed.mixed).toBe(true);
    expect(mixed.amount).toBeNull();
    expect(mixed.byCurrency).toHaveLength(2);
  });
});

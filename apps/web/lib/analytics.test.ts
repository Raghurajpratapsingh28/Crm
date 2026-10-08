import { describe, expect, it } from "vitest";
import { activityHeadline, chartNumber, formatTrend, formatWinRate } from "./analytics";
import { matchPreset, rangeForPreset, todayYmd } from "./analytics-dates";

describe("analytics dates", () => {
  it("defaults this month in the organization timezone", () => {
    const now = new Date("2026-09-20T12:00:00.000Z");
    expect(todayYmd("UTC", now)).toBe("2026-09-20");
    expect(rangeForPreset("this_month", "UTC", now)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(matchPreset("2026-09-01", "2026-09-30", "UTC", now)).toBe("this_month");
    expect(rangeForPreset("last_7", "UTC", now)).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });
});

describe("analytics display helpers", () => {
  it("rejects NaN chart values and formats zero-data win rate", () => {
    expect(chartNumber("1250000.00")).toBe(1250000);
    expect(chartNumber("nope")).toBeNull();
    expect(formatWinRate(0, false)).toBe("No closed deals");
    expect(formatTrend(null, false)).toBeNull();
    expect(formatTrend(20, true)).toBe("+20.0%");
    expect(
      activityHeadline({
        id: "1",
        type: "STATUS_CHANGE",
        content: null,
        occurredAt: "2026-09-20T10:42:00.000Z",
        author: { id: "u1", fullName: "Raghuraj" },
        deal: { id: "d1", name: "Acme deal" },
        company: null,
        contact: null,
        metadata: { toStageName: "Negotiation" },
      }),
    ).toBe("Raghuraj moved Acme deal to Negotiation");
  });
});

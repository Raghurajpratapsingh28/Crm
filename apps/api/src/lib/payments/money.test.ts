import { describe, expect, it } from "vitest";
import { fromMinorUnits, normalizeCurrency, toMinorUnits } from "./money.js";

describe("money", () => {
  it("converts major units to integer minor units", () => {
    expect(toMinorUnits("10.99", "USD")).toBe(1099);
    expect(toMinorUnits("999.00", "INR")).toBe(99900);
    expect(fromMinorUnits(1099, "USD")).toBe("10.99");
    expect(fromMinorUnits(99900, "INR")).toBe("999.00");
  });

  it("normalizes ISO currency codes", () => {
    expect(normalizeCurrency("inr")).toBe("INR");
    expect(() => normalizeCurrency("rupees")).toThrow(/ISO 4217/);
  });
});

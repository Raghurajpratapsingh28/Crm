import { describe, expect, it } from "vitest";
import { formatMoney } from "./deals";

describe("formatMoney", () => {
  it("formats numeric amounts and empty values", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(250000, "INR")).toContain("250,000");
  });
});

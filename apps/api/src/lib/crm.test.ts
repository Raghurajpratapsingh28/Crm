import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  normalizePhone,
  normalizeTags,
  normalizeWebsite,
  parseEmployeeCount,
  parsePagination,
  whitelistSort,
} from "./crm.js";

describe("crm helpers", () => {
  it("normalizes emails, tags, phones, and websites", () => {
    expect(normalizeEmail(" John@Example.com ")).toBe("john@example.com");
    expect(normalizeTags([" Enterprise ", "enterprise", "ENTERPRISE", " "])).toEqual(["enterprise"]);
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizeWebsite("acme.com")).toMatch(/^https:\/\/acme.com/);
  });

  it("rejects unsafe employee counts and caps pagination", () => {
    expect(() => parseEmployeeCount(-1)).toThrow();
    expect(() => parseEmployeeCount("nope")).toThrow();
    expect(parsePagination({ page: 0, limit: 1_000_000 })).toEqual({ page: 1, limit: 100, skip: 0 });
    expect(whitelistSort("DROP TABLE", { name: "name" }, "createdAt")).toBe("createdAt");
  });
});

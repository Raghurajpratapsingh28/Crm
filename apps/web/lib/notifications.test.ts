import { describe, expect, it } from "vitest";
import { notificationHref, relativeTime } from "./notifications";

describe("notification deep links", () => {
  it("routes entity types to CRM records", () => {
    expect(notificationHref({ entityType: "DEAL", entityId: "d1" })).toBe("/deals/d1");
    expect(notificationHref({ entityType: "TASK", entityId: "t1" })).toBe("/tasks/t1");
    expect(notificationHref({ entityType: "CONTACT", entityId: "c1" })).toBe("/contacts/c1");
    expect(notificationHref({ entityType: "COMPANY", entityId: "co1" })).toBe("/companies/co1");
    expect(notificationHref({ payload: { taskId: "t2" } })).toBe("/tasks/t2");
    expect(notificationHref({})).toBe("/notifications");
  });

  it("falls back when the entity is missing", () => {
    expect(notificationHref({ entityType: "DEAL", entityId: null })).toBe("/notifications");
    expect(relativeTime(new Date().toISOString()).length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import {
  activityLabel,
  dayGroupLabel,
  dueLabel,
  groupActivitiesByDay,
  notificationCopy,
  notificationHref,
  type ActivityRecord,
} from "./followups";

const now = new Date("2026-09-19T15:00:00");

function activity(partial: Partial<ActivityRecord>): ActivityRecord {
  return {
    id: partial.id ?? "a1",
    type: partial.type ?? "CALL",
    content: partial.content ?? "Called Rahul",
    occurredAt: partial.occurredAt ?? "2026-09-19T10:42:00Z",
    createdAt: partial.createdAt ?? "2026-09-19T15:00:00Z",
    ...partial,
  };
}

describe("followups helpers", () => {
  it("labels activity types for display", () => {
    expect(activityLabel("CALL")).toBe("Call");
    expect(activityLabel("STATUS_CHANGE")).toBe("Status Change");
  });

  it("groups timeline items by local day", () => {
    const groups = groupActivitiesByDay(
      [
        activity({ id: "1", occurredAt: "2026-09-19T10:42:00" }),
        activity({ id: "2", type: "NOTE", occurredAt: "2026-09-19T09:10:00" }),
        activity({ id: "3", occurredAt: "2026-09-18T16:20:00" }),
        activity({ id: "4", occurredAt: "2026-09-17T12:00:00" }),
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", dayGroupLabel("2026-09-17T12:00:00", now)]);
    expect(groups[0]?.items).toHaveLength(2);
  });

  it("marks overdue open tasks and never marks done tasks overdue", () => {
    expect(dueLabel({ dueDate: "2026-09-18T10:00:00Z", isOverdue: true, status: "OPEN" })).toContain("Overdue");
    expect(dueLabel({ dueDate: "2026-09-18T10:00:00Z", isOverdue: false, status: "DONE" })).toMatch(/^Due /);
  });

  it("routes task notifications to the task page", () => {
    expect(notificationHref({ taskId: "t1" })).toBe("/tasks/t1");
    expect(notificationCopy("TASK_REMINDER", { title: "Send proposal" }).heading).toBe("Upcoming task");
    expect(notificationCopy("FOLLOW_UP_OVERDUE", { title: "Call Rahul" }).body).toContain("Call Rahul");
  });
});

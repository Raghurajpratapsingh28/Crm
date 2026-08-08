import { describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import { isTaskOverdue, overdueDedupeKey, parseActivityType, reminderDedupeKey } from "./activity-task.js";

describe("activity and task helpers", () => {
  it("rejects client-created STATUS_CHANGE types", () => {
    expect(() => parseActivityType("STATUS_CHANGE")).toThrow(AppError);
    expect(parseActivityType("CALL")).toBe("CALL");
  });

  it("derives overdue only for open past-due tasks", () => {
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    expect(isTaskOverdue("OPEN", past)).toBe(true);
    expect(isTaskOverdue("OPEN", future)).toBe(false);
    expect(isTaskOverdue("DONE", past)).toBe(false);
  });

  it("builds stable reminder keys", () => {
    const due = new Date("2026-09-25T12:00:00.000Z");
    expect(reminderDedupeKey("task-1", due)).toBe("TASK_REMINDER:task-1:2026-09-25T12:00:00.000Z");
    expect(overdueDedupeKey("task-1", new Date("2026-09-22T15:00:00.000Z"))).toBe("TASK_OVERDUE:task-1:2026-09-22");
  });
});

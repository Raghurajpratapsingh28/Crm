package tasks

import (
	"testing"
	"time"
)

func TestReminderKeys(t *testing.T) {
	due := time.Date(2026, 9, 25, 12, 0, 0, 0, time.UTC)
	if got := ReminderKey("task-1", due); got != "TASK_REMINDER:task-1:2026-09-25T12:00:00.000Z" {
		t.Fatalf("reminder key = %s", got)
	}
	if got := OverdueKey("task-1", time.Date(2026, 9, 22, 15, 0, 0, 0, time.UTC)); got != "TASK_OVERDUE:task-1:2026-09-22" {
		t.Fatalf("overdue key = %s", got)
	}
}

func TestReminderHoursDefault(t *testing.T) {
	t.Setenv("TASK_REMINDER_HOURS", "")
	if ReminderHours() != 24 {
		t.Fatal("expected default 24")
	}
	t.Setenv("TASK_REMINDER_HOURS", "12")
	if ReminderHours() != 12 {
		t.Fatal("expected 12")
	}
}

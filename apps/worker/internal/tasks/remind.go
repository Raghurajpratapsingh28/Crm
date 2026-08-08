package tasks

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"

	"crm/worker/internal/jobs"
)

type Remind struct{ DB *sql.DB }

func (Remind) Type() string { return jobs.TasksRemind }

func ReminderHours() int {
	raw := os.Getenv("TASK_REMINDER_HOURS")
	if raw == "" {
		return 24
	}
	hours, err := strconv.Atoi(raw)
	if err != nil || hours < 1 {
		return 24
	}
	return hours
}

func ReminderKey(taskID string, due time.Time) string {
	return fmt.Sprintf("TASK_REMINDER:%s:%s", taskID, due.UTC().Format("2006-01-02T15:04:05.000Z07:00"))
}

func OverdueKey(taskID string, now time.Time) string {
	return fmt.Sprintf("TASK_OVERDUE:%s:%s", taskID, now.UTC().Format("2006-01-02"))
}

func (h Remind) Handle(ctx context.Context, job jobs.Job) error {
	if h.DB == nil {
		return fmt.Errorf("task reminder handler missing database")
	}
	result, err := Sweep(ctx, h.DB, time.Now(), ReminderHours())
	if err != nil {
		return err
	}
	slog.Info("task_reminder_job", "job_id", job.ID, "reminders", result.Reminders, "overdues", result.Overdues)
	return nil
}

type SweepResult struct {
	Reminders int
	Overdues  int
}

type dueTask struct {
	ID             string
	OrganizationID string
	AssigneeID     string
	Title          string
	DueDate        time.Time
}

func Sweep(ctx context.Context, db *sql.DB, now time.Time, hours int) (SweepResult, error) {
	until := now.Add(time.Duration(hours) * time.Hour)
	upcoming, err := queryTasks(ctx, db, `
		SELECT id, organization_id, assignee_id, title, due_date
		FROM tasks
		WHERE status = 'OPEN' AND due_date IS NOT NULL AND due_date > $1 AND due_date <= $2
	`, now, until)
	if err != nil {
		return SweepResult{}, err
	}
	overdue, err := queryTasks(ctx, db, `
		SELECT id, organization_id, assignee_id, title, due_date
		FROM tasks
		WHERE status = 'OPEN' AND due_date IS NOT NULL AND due_date < $1
	`, now)
	if err != nil {
		return SweepResult{}, err
	}

	var result SweepResult
	for _, task := range upcoming {
		created, err := insertOnce(ctx, db, task, "TASK_REMINDER", ReminderKey(task.ID, task.DueDate), now)
		if err != nil {
			return result, err
		}
		if created {
			result.Reminders++
		}
	}
	for _, task := range overdue {
		created, err := insertOnce(ctx, db, task, "FOLLOW_UP_OVERDUE", OverdueKey(task.ID, now), now)
		if err != nil {
			return result, err
		}
		if created {
			result.Overdues++
		}
	}
	return result, nil
}

func queryTasks(ctx context.Context, db *sql.DB, query string, args ...any) ([]dueTask, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []dueTask
	for rows.Next() {
		var task dueTask
		if err := rows.Scan(&task.ID, &task.OrganizationID, &task.AssigneeID, &task.Title, &task.DueDate); err != nil {
			return nil, err
		}
		out = append(out, task)
	}
	return out, rows.Err()
}

func insertOnce(ctx context.Context, db *sql.DB, task dueTask, notifType, key string, now time.Time) (bool, error) {
	payload, err := json.Marshal(map[string]string{
		"taskId":  task.ID,
		"title":   task.Title,
		"dueDate": task.DueDate.UTC().Format(time.RFC3339),
	})
	if err != nil {
		return false, err
	}
	title := "Upcoming task"
	message := fmt.Sprintf("%q is due soon.", task.Title)
	if notifType == "FOLLOW_UP_OVERDUE" {
		title = "Task overdue"
		message = fmt.Sprintf("%q is overdue.", task.Title)
	}
	res, err := db.ExecContext(ctx, `
		INSERT INTO notifications (id, organization_id, user_id, type, title, message, entity_type, entity_id, payload, dedupe_key, created_at, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'TASK', $6, $7::jsonb, $8, $9, $9)
		ON CONFLICT (dedupe_key) DO NOTHING
	`, task.OrganizationID, task.AssigneeID, notifType, title, message, task.ID, string(payload), key, now)
	if err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

package notifications

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"

	"crm/worker/internal/jobs"
)

var knownTypes = map[string]struct{}{
	"LEAD_ASSIGNED":         {},
	"DEAL_STAGE_CHANGED":    {},
	"DEAL_ASSIGNED":         {},
	"DEAL_WON":              {},
	"DEAL_LOST":             {},
	"FOLLOW_UP_OVERDUE":     {},
	"TASK_ASSIGNED":         {},
	"TASK_REMINDER":         {},
	"PROPOSAL_ACCEPTED":     {},
	"PAYMENT_RECEIVED":      {},
	"TEAM_MEMBER_JOINED":    {},
	"MEMBER_ROLE_CHANGED":   {},
	"MEMBER_STATUS_CHANGED": {},
}

type Handler struct{ DB *sql.DB }

type FanoutPayload struct {
	Version        int             `json:"version"`
	OrganizationID string          `json:"organizationId"`
	UserID         string          `json:"userId"`
	Type           string          `json:"type"`
	Payload        json.RawMessage `json:"payload"`
	DedupeKey      string          `json:"dedupeKey"`
	Title          string          `json:"title"`
	Message        string          `json:"message"`
	EntityType     string          `json:"entityType"`
	EntityID       string          `json:"entityId"`
}

func (h Handler) Type() string { return jobs.NotificationFanout }

func (h Handler) Handle(ctx context.Context, job jobs.Job) error {
	payload, err := ParseFanoutPayload(job.Payload)
	if err != nil {
		return jobs.Permanent(err)
	}
	if _, ok := knownTypes[payload.Type]; !ok {
		return jobs.Permanent(fmt.Errorf("unsupported notification type %q", payload.Type))
	}
	if h.DB == nil {
		return jobs.Transient(fmt.Errorf("notification handler missing database"))
	}
	if job.OrganizationID != "" && payload.OrganizationID != "" && job.OrganizationID != payload.OrganizationID {
		return jobs.Permanent(fmt.Errorf("organization mismatch"))
	}
	if payload.DedupeKey == "" {
		payload.DedupeKey = fmt.Sprintf("JOB:%s", job.ID)
	}

	created, err := InsertNotification(ctx, h.DB, job.ID, payload)
	if err != nil {
		return err
	}
	if created {
		slog.Info("notification_created",
			"job_id", job.ID,
			"job_type", job.Type,
			"notification_type", payload.Type,
			"organization_id", payload.OrganizationID,
		)
	}
	return nil
}

func ParseFanoutPayload(raw json.RawMessage) (FanoutPayload, error) {
	var payload FanoutPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return FanoutPayload{}, err
	}
	if payload.OrganizationID == "" || payload.UserID == "" || payload.Type == "" {
		return FanoutPayload{}, fmt.Errorf("notification payload missing required fields")
	}
	if len(payload.Payload) == 0 {
		payload.Payload = json.RawMessage(`{}`)
	}
	if payload.Title == "" || payload.Message == "" || payload.EntityType == "" {
		copy := Content(payload.Type, payload.Payload)
		if payload.Title == "" {
			payload.Title = copy.Title
		}
		if payload.Message == "" {
			payload.Message = copy.Message
		}
		if payload.EntityType == "" {
			payload.EntityType = copy.EntityType
			payload.EntityID = copy.EntityID
		}
	}
	return payload, nil
}

type Copy struct {
	Title      string
	Message    string
	EntityType string
	EntityID   string
}

func Content(notifType string, raw json.RawMessage) Copy {
	var payload map[string]any
	_ = json.Unmarshal(raw, &payload)
	name := stringField(payload, "title", "name", "dealName")
	if name == "" {
		name = "a record"
	}
	taskID := stringField(payload, "taskId")
	dealID := stringField(payload, "dealId")
	switch notifType {
	case "TASK_ASSIGNED":
		return Copy{Title: "New task assigned", Message: fmt.Sprintf("%q was assigned to you.", name), EntityType: "TASK", EntityID: taskID}
	case "TASK_REMINDER":
		return Copy{Title: "Upcoming task", Message: fmt.Sprintf("%q is due soon.", name), EntityType: "TASK", EntityID: taskID}
	case "FOLLOW_UP_OVERDUE":
		return Copy{Title: "Task overdue", Message: fmt.Sprintf("%q is overdue.", name), EntityType: "TASK", EntityID: taskID}
	case "DEAL_ASSIGNED", "LEAD_ASSIGNED":
		return Copy{Title: "Deal assigned", Message: fmt.Sprintf("%q was assigned to you.", name), EntityType: "DEAL", EntityID: dealID}
	case "DEAL_WON":
		return Copy{Title: "Deal won", Message: fmt.Sprintf("%q was marked as won.", name), EntityType: "DEAL", EntityID: dealID}
	case "DEAL_LOST":
		return Copy{Title: "Deal lost", Message: fmt.Sprintf("%q was marked as lost.", name), EntityType: "DEAL", EntityID: dealID}
	case "DEAL_STAGE_CHANGED":
		fromStage := stringField(payload, "fromStage")
		toStage := stringField(payload, "toStage")
		title := "Deal stage changed"
		if toStage == "Negotiation" {
			title = "Deal moved to Negotiation"
		}
		message := fmt.Sprintf("%q changed stage.", name)
		if fromStage != "" && toStage != "" {
			message = fmt.Sprintf("%q moved from %s to %s.", name, fromStage, toStage)
		}
		return Copy{Title: title, Message: message, EntityType: "DEAL", EntityID: dealID}
	default:
		entityType, entityID := "", ""
		if dealID != "" {
			entityType, entityID = "DEAL", dealID
		} else if taskID != "" {
			entityType, entityID = "TASK", taskID
		}
		return Copy{Title: "Notification", Message: name, EntityType: entityType, EntityID: entityID}
	}
}

func stringField(payload map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := payload[key]; ok && value != nil {
			if text, ok := value.(string); ok && text != "" {
				return text
			}
		}
	}
	return ""
}

func InsertNotification(ctx context.Context, db *sql.DB, jobID string, payload FanoutPayload) (bool, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()

	var status string
	err = tx.QueryRowContext(ctx, `
		SELECT status
		FROM organization_members
		WHERE organization_id = $1 AND user_id = $2
		LIMIT 1
	`, payload.OrganizationID, payload.UserID).Scan(&status)
	if err == sql.ErrNoRows {
		slog.Info("notification_skipped", "reason", "recipient_missing", "job_id", jobID, "organization_id", payload.OrganizationID)
		return false, tx.Commit()
	}
	if err != nil {
		return false, err
	}
	if status != "ACTIVE" {
		slog.Info("notification_skipped", "reason", "recipient_inactive", "job_id", jobID, "organization_id", payload.OrganizationID)
		return false, tx.Commit()
	}

	var entityType any
	var entityID any
	if payload.EntityType != "" {
		entityType = payload.EntityType
	}
	if payload.EntityID != "" {
		entityID = payload.EntityID
	}

	res, err := tx.ExecContext(ctx, `
		INSERT INTO notifications (
			id, organization_id, user_id, type, title, message, entity_type, entity_id, payload, dedupe_key, created_at, updated_at
		)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now(), now())
		ON CONFLICT (dedupe_key) DO NOTHING
	`, payload.OrganizationID, payload.UserID, payload.Type, payload.Title, payload.Message, entityType, entityID, string(payload.Payload), payload.DedupeKey)
	if err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	n, _ := res.RowsAffected()
	return n == 1, nil
}

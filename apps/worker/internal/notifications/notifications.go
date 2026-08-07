package notifications

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"crm/worker/internal/jobs"
)

type Handler struct{ DB *sql.DB }

type FanoutPayload struct {
	OrganizationID string          `json:"organizationId"`
	UserID         string          `json:"userId"`
	Type           string          `json:"type"`
	Payload        json.RawMessage `json:"payload"`
}

func (h Handler) Type() string { return jobs.NotificationFanout }

func (h Handler) Handle(ctx context.Context, job jobs.Job) error {
	payload, err := ParseFanoutPayload(job.Payload)
	if err != nil {
		return err
	}
	if h.DB == nil {
		return fmt.Errorf("notification handler missing database")
	}
	if err := InsertNotification(ctx, h.DB, job.ID, payload); err != nil {
		return err
	}
	log.Printf("notification fanout job %s user=%s type=%s", job.ID, payload.UserID, payload.Type)
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
	return payload, nil
}

func InsertNotification(ctx context.Context, db *sql.DB, jobID string, payload FanoutPayload) error {
	_, err := db.ExecContext(ctx, `
		INSERT INTO notifications (id, organization_id, user_id, type, payload, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, now(), now())
		ON CONFLICT (id) DO NOTHING
	`, jobID, payload.OrganizationID, payload.UserID, payload.Type, string(payload.Payload))
	return err
}

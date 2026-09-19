package notifications

import (
	"context"
	"log"

	"crm/worker/internal/jobs"
)

type Handler struct{}

func (Handler) Type() string { return jobs.NotificationFanout }

func (Handler) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("notification fanout job %s", job.ID)
	return nil
}

package email

import (
	"context"
	"log"

	"crm/worker/internal/jobs"
)

type Handler struct{ TypeName string }

func (h Handler) Type() string { return h.TypeName }

func (h Handler) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("email job %s type=%s payload=%s", job.ID, job.Type, string(job.Payload))
	return nil
}

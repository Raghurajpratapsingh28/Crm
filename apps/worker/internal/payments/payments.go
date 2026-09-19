package payments

import (
	"context"
	"log"

	"crm/worker/internal/jobs"
)

type Reconcile struct{}

func (Reconcile) Type() string { return jobs.PaymentsReconcile }

func (Reconcile) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("reconcile payment webhook job %s payload=%s", job.ID, string(job.Payload))
	return nil
}

type Dunning struct{}

func (Dunning) Type() string { return jobs.PaymentsDunning }

func (Dunning) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("dunning job %s", job.ID)
	return nil
}

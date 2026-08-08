package payments

import (
	"context"
	"log/slog"

	"crm/worker/internal/jobs"
)

type Reconcile struct{}

func (Reconcile) Type() string { return jobs.PaymentsReconcile }

func (Reconcile) Handle(_ context.Context, job jobs.Job) error {
	slog.Info("payments_reconcile", "job_id", job.ID)
	return nil
}

type Dunning struct{}

func (Dunning) Type() string { return jobs.PaymentsDunning }

func (Dunning) Handle(_ context.Context, job jobs.Job) error {
	slog.Info("payments_dunning", "job_id", job.ID)
	return nil
}

package analytics

import (
	"context"
	"log"

	"crm/worker/internal/jobs"
)

type Rollup struct{}

func (Rollup) Type() string { return jobs.AnalyticsRollup }

func (Rollup) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("analytics rollup job %s", job.ID)
	return nil
}

type FlagStale struct{}

func (FlagStale) Type() string { return jobs.DealsFlagStale }

func (FlagStale) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("flag stale deals job %s", job.ID)
	return nil
}

type RemindTasks struct{}

func (RemindTasks) Type() string { return jobs.TasksRemind }

func (RemindTasks) Handle(_ context.Context, job jobs.Job) error {
	log.Printf("task reminders job %s", job.ID)
	return nil
}

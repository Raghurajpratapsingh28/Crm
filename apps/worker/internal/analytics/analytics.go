package analytics

import (
	"context"
	"log/slog"

	"crm/worker/internal/jobs"
)

type Rollup struct{}

func (Rollup) Type() string { return jobs.AnalyticsRollup }

func (Rollup) Handle(_ context.Context, job jobs.Job) error {
	slog.Info("analytics_rollup", "job_id", job.ID)
	return nil
}

type FlagStale struct{}

func (FlagStale) Type() string { return jobs.DealsFlagStale }

func (FlagStale) Handle(_ context.Context, job jobs.Job) error {
	slog.Info("deals_flag_stale", "job_id", job.ID)
	return nil
}

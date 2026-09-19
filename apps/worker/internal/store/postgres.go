package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"crm/worker/internal/jobs"
)

// Postgres claims jobs with SKIP LOCKED so multiple worker replicas stay safe.
type Postgres struct {
	DB *sql.DB
}

func (p *Postgres) Claim(ctx context.Context, workerID string, now time.Time) (*jobs.Job, error) {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRowContext(ctx, `
		SELECT id, type, payload, attempts
		FROM jobs
		WHERE status = 'PENDING' AND available_at <= $1
		ORDER BY available_at
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`, now)

	var job jobs.Job
	if err := row.Scan(&job.ID, &job.Type, &job.Payload, &job.Attempt); err != nil {
		if err == sql.ErrNoRows {
			return nil, tx.Commit()
		}
		return nil, err
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE jobs
		SET status = 'RUNNING', locked_at = $2, locked_by = $3, attempts = attempts + 1
		WHERE id = $1
	`, job.ID, now, workerID); err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}
	job.Attempt++
	return &job, nil
}

func (p *Postgres) Succeed(ctx context.Context, jobID string, now time.Time) error {
	_, err := p.DB.ExecContext(ctx, `
		UPDATE jobs SET status = 'SUCCEEDED', processed_at = $2, error = NULL
		WHERE id = $1
	`, jobID, now)
	return err
}

func (p *Postgres) Fail(ctx context.Context, jobID string, fail error, retryAt time.Time) error {
	_, err := p.DB.ExecContext(ctx, `
		UPDATE jobs SET status = 'PENDING', available_at = $2, error = $3, locked_at = NULL, locked_by = NULL
		WHERE id = $1
	`, jobID, retryAt, fmt.Sprintf("%v", fail))
	return err
}

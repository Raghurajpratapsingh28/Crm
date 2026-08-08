package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"crm/worker/internal/jobs"
)

const ClaimSQL = `
		SELECT id, type, payload, attempts, max_attempts, COALESCE(request_id, ''), COALESCE(organization_id::text, ''), status
		FROM jobs
		WHERE (
			status = 'PENDING' AND available_at <= $1
		) OR (
			status = 'RUNNING' AND locked_at IS NOT NULL AND locked_at < $2
		)
		ORDER BY available_at
		FOR UPDATE SKIP LOCKED
		LIMIT $3
	`

// Postgres claims jobs with SKIP LOCKED so multiple worker replicas stay safe.
type Postgres struct {
	DB *sql.DB
}

func (p *Postgres) Claim(ctx context.Context, workerID string, now time.Time, limit int, lockTimeout time.Duration) ([]jobs.Job, error) {
	if limit < 1 {
		limit = 1
	}
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	staleBefore := now.Add(-lockTimeout)
	rows, err := tx.QueryContext(ctx, ClaimSQL, now, staleBefore, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var claimed []jobs.Job
	for rows.Next() {
		var job jobs.Job
		var status string
		if err := rows.Scan(&job.ID, &job.Type, &job.Payload, &job.Attempt, &job.MaxAttempts, &job.RequestID, &job.OrganizationID, &status); err != nil {
			return nil, err
		}
		job.Recovered = status == "RUNNING"
		claimed = append(claimed, job)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(claimed) == 0 {
		return nil, tx.Commit()
	}

	args := make([]any, 0, len(claimed)+2)
	args = append(args, now, workerID)
	placeholders := make([]string, 0, len(claimed))
	for i, job := range claimed {
		args = append(args, job.ID)
		placeholders = append(placeholders, fmt.Sprintf("$%d", i+3))
	}

	query := `UPDATE jobs SET status = 'RUNNING', locked_at = $1, locked_by = $2, attempts = attempts + 1 WHERE id IN (` + strings.Join(placeholders, ",") + `)`
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	for i := range claimed {
		claimed[i].Attempt++
		if claimed[i].MaxAttempts < 1 {
			claimed[i].MaxAttempts = 5
		}
	}
	return claimed, nil
}

func (p *Postgres) Succeed(ctx context.Context, jobID string, now time.Time) error {
	_, err := p.DB.ExecContext(ctx, `
		UPDATE jobs
		SET status = 'SUCCEEDED', processed_at = $2, error = NULL, locked_at = NULL, locked_by = NULL
		WHERE id = $1
	`, jobID, now)
	return err
}

func (p *Postgres) Fail(ctx context.Context, job jobs.Job, fail error, retryAt time.Time, deadLetter bool) error {
	msg := jobs.TruncateError(fail, 2000)
	if deadLetter {
		_, err := p.DB.ExecContext(ctx, `
			UPDATE jobs
			SET status = 'FAILED', failed_at = $2, error = $3, locked_at = NULL, locked_by = NULL
			WHERE id = $1
		`, job.ID, time.Now(), msg)
		return err
	}
	_, err := p.DB.ExecContext(ctx, `
		UPDATE jobs
		SET status = 'PENDING', available_at = $2, error = $3, locked_at = NULL, locked_by = NULL
		WHERE id = $1
	`, job.ID, retryAt, msg)
	return err
}

func (p *Postgres) Purge(ctx context.Context, now time.Time, completedAge, failedAge time.Duration, limit int) (int64, error) {
	if limit < 1 {
		limit = 500
	}
	completedBefore := now.Add(-completedAge)
	failedBefore := now.Add(-failedAge)
	res, err := p.DB.ExecContext(ctx, `
		DELETE FROM jobs
		WHERE id IN (
			SELECT id FROM jobs
			WHERE (status = 'SUCCEEDED' AND processed_at IS NOT NULL AND processed_at < $1)
			   OR (status = 'FAILED' AND failed_at IS NOT NULL AND failed_at < $2)
			LIMIT $3
		)
	`, completedBefore, failedBefore, limit)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

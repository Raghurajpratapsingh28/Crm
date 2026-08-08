package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

// Types must stay aligned with packages/types JobType.
const (
	EmailInvite        = "email.invite"
	EmailReceipt       = "email.receipt"
	EmailFollowUp      = "email.follow_up"
	NotificationFanout = "notification.fanout"
	PaymentsReconcile  = "payments.reconcile"
	PaymentsDunning    = "payments.dunning"
	AnalyticsRollup    = "analytics.rollup"
	DealsFlagStale     = "deals.flag_stale"
	TasksRemind        = "tasks.remind"
)

type Job struct {
	ID             string
	Type           string
	Payload        json.RawMessage
	Attempt        int
	MaxAttempts    int
	RequestID      string
	OrganizationID string
	Recovered      bool
}

type Handler interface {
	Type() string
	Handle(ctx context.Context, job Job) error
}

type Store interface {
	Claim(ctx context.Context, workerID string, now time.Time, limit int, lockTimeout time.Duration) ([]Job, error)
	Succeed(ctx context.Context, jobID string, now time.Time) error
	Fail(ctx context.Context, job Job, err error, retryAt time.Time, deadLetter bool) error
	Purge(ctx context.Context, now time.Time, completedAge, failedAge time.Duration, limit int) (int64, error)
}

type JobError struct {
	Retryable bool
	Err       error
}

func (e *JobError) Error() string {
	if e == nil || e.Err == nil {
		return "job error"
	}
	return e.Err.Error()
}

func (e *JobError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

func Permanent(err error) error {
	if err == nil {
		return nil
	}
	return &JobError{Retryable: false, Err: err}
}

func Transient(err error) error {
	if err == nil {
		return nil
	}
	return &JobError{Retryable: true, Err: err}
}

func IsRetryable(err error) bool {
	var je *JobError
	if errors.As(err, &je) {
		return je.Retryable
	}
	return true
}

func UnknownType(jobType string) error {
	return Permanent(fmt.Errorf("unknown job type %q", jobType))
}

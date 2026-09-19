package jobs

import (
	"context"
	"encoding/json"
	"time"
)

// Types must stay aligned with packages/types JobType.
const (
	EmailInvite         = "email.invite"
	EmailReceipt        = "email.receipt"
	EmailFollowUp       = "email.follow_up"
	NotificationFanout  = "notification.fanout"
	PaymentsReconcile   = "payments.reconcile"
	PaymentsDunning     = "payments.dunning"
	AnalyticsRollup     = "analytics.rollup"
	DealsFlagStale      = "deals.flag_stale"
	TasksRemind         = "tasks.remind"
)

type Job struct {
	ID      string
	Type    string
	Payload json.RawMessage
	Attempt int
}

type Handler interface {
	Type() string
	Handle(ctx context.Context, job Job) error
}

type Store interface {
	Claim(ctx context.Context, workerID string, now time.Time) (*Job, error)
	Succeed(ctx context.Context, jobID string, now time.Time) error
	Fail(ctx context.Context, jobID string, err error, retryAt time.Time) error
}

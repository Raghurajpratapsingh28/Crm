package jobs

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"
)

const jobTimeout = 30 * time.Second

type Runtime struct {
	Store           Store
	Registry        Registry
	WorkerID        string
	Interval        time.Duration
	BatchSize       int
	Concurrency     int
	LockTimeout     time.Duration
	RetryBaseDelay  time.Duration
	MaxBackoff      time.Duration
	RetryJitter     time.Duration
	ShutdownTimeout time.Duration
}

func Run(ctx context.Context, rt Runtime) error {
	if rt.BatchSize < 1 {
		rt.BatchSize = 20
	}
	if rt.Concurrency < 1 {
		rt.Concurrency = 10
	}
	if rt.Interval <= 0 {
		rt.Interval = 2 * time.Second
	}
	if rt.ShutdownTimeout <= 0 {
		rt.ShutdownTimeout = 25 * time.Second
	}

	t := time.NewTicker(rt.Interval)
	defer t.Stop()

	var wg sync.WaitGroup
	sem := make(chan struct{}, rt.Concurrency)

	process := func(job Job) {
		defer wg.Done()
		defer func() { <-sem }()
		start := time.Now()
		attrs := []any{
			"job_id", job.ID,
			"job_type", job.Type,
			"attempt", job.Attempt,
			"max_attempts", job.MaxAttempts,
			"worker_id", rt.WorkerID,
		}
		if job.RequestID != "" {
			attrs = append(attrs, "request_id", job.RequestID)
		}
		if job.Recovered {
			slog.Info("job_recovered", attrs...)
		}
		slog.Info("job_started", attrs...)

		jobCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jobTimeout)
		runErr := rt.Registry.Dispatch(jobCtx, job)
		cancel()
		duration := time.Since(start).Milliseconds()
		attrs = append(attrs, "duration_ms", duration)

		finishCtx := context.WithoutCancel(ctx)
		if runErr != nil {
			retryable := IsRetryable(runErr)
			dead := !retryable || job.Attempt >= job.MaxAttempts
			retryAt := time.Now().Add(Backoff(job.Attempt, rt.RetryBaseDelay, rt.MaxBackoff, rt.RetryJitter))
			event := "job_retry"
			if dead {
				event = "job_failed"
			}
			if !rt.Registry.Has(job.Type) {
				slog.Error("job_unknown_type", attrs...)
			}
			slog.Error(event, append(attrs, "error", runErr.Error(), "retryable", retryable, "dead_letter", dead)...)
			if err := rt.Store.Fail(finishCtx, job, runErr, retryAt, dead); err != nil {
				slog.Error("job_fail_persist", append(attrs, "error", err.Error())...)
			}
			return
		}
		if err := rt.Store.Succeed(finishCtx, job.ID, time.Now()); err != nil {
			slog.Error("job_succeed_persist", append(attrs, "error", err.Error())...)
			return
		}
		slog.Info("job_completed", attrs...)
	}

	for {
		if err := ctx.Err(); err != nil {
			break
		}

		claimed, err := rt.Store.Claim(ctx, rt.WorkerID, time.Now(), rt.BatchSize, rt.LockTimeout)
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				break
			}
			slog.Error("job_claim", "error", err.Error(), "worker_id", rt.WorkerID)
			if wait(ctx, t) != nil {
				break
			}
			continue
		}
		if len(claimed) == 0 {
			if wait(ctx, t) != nil {
				break
			}
			continue
		}

		slog.Info("job_claimed", "count", len(claimed), "worker_id", rt.WorkerID)
		for _, job := range claimed {
			if ctx.Err() != nil {
				// Still process already-claimed jobs; stop claiming more in the next loop.
			}
			sem <- struct{}{}
			wg.Add(1)
			go process(job)
		}

		done := make(chan struct{})
		go func() {
			wg.Wait()
			close(done)
		}()
		select {
		case <-done:
		case <-ctx.Done():
			select {
			case <-done:
			case <-time.After(rt.ShutdownTimeout):
				slog.Warn("worker_shutdown_timeout", "worker_id", rt.WorkerID, "timeout", rt.ShutdownTimeout.String())
				return nil
			}
			return nil
		}
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()
	select {
	case <-done:
		return nil
	case <-time.After(rt.ShutdownTimeout):
		slog.Warn("worker_shutdown_timeout", "worker_id", rt.WorkerID, "timeout", rt.ShutdownTimeout.String())
		return nil
	}
}

func wait(ctx context.Context, t *time.Ticker) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

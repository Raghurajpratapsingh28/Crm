package jobs

import (
	"context"
	"errors"
	"log"
	"time"
)

const jobTimeout = 30 * time.Second

func Run(ctx context.Context, store Store, registry Registry, workerID string, interval time.Duration) error {
	t := time.NewTicker(interval)
	defer t.Stop()

	for {
		if err := ctx.Err(); err != nil {
			log.Printf("worker stopping: %v", err)
			return nil
		}

		job, err := store.Claim(ctx, workerID, time.Now())
		if err != nil {
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				log.Printf("worker stopping: %v", err)
				return nil
			}
			log.Printf("claim: %v", err)
			if err := wait(ctx, t); err != nil {
				return nil
			}
			continue
		}
		if job == nil {
			if err := wait(ctx, t); err != nil {
				return nil
			}
			continue
		}

		jobCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), jobTimeout)
		runErr := registry.Dispatch(jobCtx, *job)
		cancel()

		if runErr != nil {
			log.Printf("job %s (%s) failed: %v", job.ID, job.Type, runErr)
			_ = store.Fail(context.WithoutCancel(ctx), job.ID, runErr, time.Now().Add(30*time.Second))
			continue
		}
		if err := store.Succeed(context.WithoutCancel(ctx), job.ID, time.Now()); err != nil {
			log.Printf("succeed %s: %v", job.ID, err)
		}
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

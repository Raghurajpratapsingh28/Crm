package jobs

import (
	"context"
	"log"
	"time"
)

func Run(ctx context.Context, store Store, registry Registry, workerID string, interval time.Duration) error {
	t := time.NewTicker(interval)
	defer t.Stop()

	for {
		if err := ctx.Err(); err != nil {
			return err
		}

		job, err := store.Claim(ctx, workerID, time.Now())
		if err != nil {
			log.Printf("claim: %v", err)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-t.C:
			}
			continue
		}
		if job == nil {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-t.C:
			}
			continue
		}

		if err := registry.Dispatch(ctx, *job); err != nil {
			log.Printf("job %s (%s) failed: %v", job.ID, job.Type, err)
			_ = store.Fail(ctx, job.ID, err, time.Now().Add(30*time.Second))
			continue
		}
		if err := store.Succeed(ctx, job.ID, time.Now()); err != nil {
			log.Printf("succeed %s: %v", job.ID, err)
		}
	}
}

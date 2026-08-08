package jobs

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type memJob struct {
	Job
	status      string
	availableAt time.Time
	lockedAt    time.Time
	error       string
}

type memoryStore struct {
	mu      sync.Mutex
	jobs    map[string]*memJob
	claimNs atomic.Int32
}

func newMemoryStore(items ...memJob) *memoryStore {
	s := &memoryStore{jobs: map[string]*memJob{}}
	for i := range items {
		item := items[i]
		if item.status == "" {
			item.status = "PENDING"
		}
		if item.MaxAttempts == 0 {
			item.MaxAttempts = 5
		}
		s.jobs[item.ID] = &item
	}
	return s
}

func (s *memoryStore) Claim(_ context.Context, workerID string, now time.Time, limit int, lockTimeout time.Duration) ([]Job, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []Job
	for _, row := range s.jobs {
		if len(out) >= limit {
			break
		}
		eligible := (row.status == "PENDING" && !row.availableAt.After(now)) ||
			(row.status == "RUNNING" && !row.lockedAt.IsZero() && now.Sub(row.lockedAt) > lockTimeout)
		if !eligible {
			continue
		}
		row.status = "RUNNING"
		row.lockedAt = now
		row.Attempt++
		row.Recovered = row.Attempt > 1 && row.error != "" || now.Sub(row.lockedAt) > lockTimeout
		copied := row.Job
		out = append(out, copied)
	}
	if len(out) > 0 {
		s.claimNs.Add(1)
	}
	_ = workerID
	return out, nil
}

func (s *memoryStore) Succeed(_ context.Context, jobID string, _ time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.jobs[jobID]
	if !ok {
		return fmt.Errorf("missing job")
	}
	row.status = "SUCCEEDED"
	return nil
}

func (s *memoryStore) Fail(_ context.Context, job Job, err error, retryAt time.Time, deadLetter bool) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	row, ok := s.jobs[job.ID]
	if !ok {
		return fmt.Errorf("missing job")
	}
	row.error = err.Error()
	if deadLetter {
		row.status = "FAILED"
		return nil
	}
	row.status = "PENDING"
	row.availableAt = retryAt
	return nil
}

func (s *memoryStore) Purge(context.Context, time.Time, time.Duration, time.Duration, int) (int64, error) {
	return 0, nil
}

func (s *memoryStore) snapshot(id string) memJob {
	s.mu.Lock()
	defer s.mu.Unlock()
	return *s.jobs[id]
}

type countingHandler struct {
	typ     string
	calls   atomic.Int32
	failFor int32
	err     error
}

func (h *countingHandler) Type() string { return h.typ }

func (h *countingHandler) Handle(context.Context, Job) error {
	n := h.calls.Add(1)
	if h.err != nil && n <= h.failFor {
		return h.err
	}
	return nil
}

func TestUnknownJobTypeFailsWithoutRetry(t *testing.T) {
	store := newMemoryStore(memJob{Job: Job{ID: "j1", Type: "UNKNOWN_JOB", MaxAttempts: 5}})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = Run(ctx, Runtime{
		Store:           store,
		Registry:        NewRegistry(),
		WorkerID:        "w1",
		Interval:        20 * time.Millisecond,
		BatchSize:       10,
		Concurrency:     2,
		LockTimeout:     time.Minute,
		RetryBaseDelay:  time.Millisecond,
		MaxBackoff:      time.Second,
		ShutdownTimeout: 200 * time.Millisecond,
	})
	got := store.snapshot("j1")
	if got.status != "FAILED" {
		t.Fatalf("status = %s", got.status)
	}
	if got.Attempt != 1 {
		t.Fatalf("attempts = %d", got.Attempt)
	}
}

func TestRetryThenDeadLetter(t *testing.T) {
	store := newMemoryStore(memJob{Job: Job{ID: "j1", Type: "ok", MaxAttempts: 3}})
	handler := &countingHandler{typ: "ok", failFor: 10, err: Transient(errors.New("boom"))}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = Run(ctx, Runtime{
		Store:           store,
		Registry:        NewRegistry(handler),
		WorkerID:        "w1",
		Interval:        5 * time.Millisecond,
		BatchSize:       5,
		Concurrency:     1,
		LockTimeout:     time.Minute,
		RetryBaseDelay:  time.Millisecond,
		MaxBackoff:      10 * time.Millisecond,
		ShutdownTimeout: 200 * time.Millisecond,
	})
	got := store.snapshot("j1")
	if got.status != "FAILED" {
		t.Fatalf("status = %s attempt=%d", got.status, got.Attempt)
	}
	if got.Attempt != 3 {
		t.Fatalf("attempts = %d", got.Attempt)
	}
}

func TestSuccessfulJobAndIdempotentHandler(t *testing.T) {
	store := newMemoryStore(memJob{Job: Job{ID: "j1", Type: "ok", MaxAttempts: 5}})
	handler := &countingHandler{typ: "ok"}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = Run(ctx, Runtime{
		Store:           store,
		Registry:        NewRegistry(handler),
		WorkerID:        "w1",
		Interval:        20 * time.Millisecond,
		BatchSize:       5,
		Concurrency:     2,
		LockTimeout:     time.Minute,
		RetryBaseDelay:  time.Millisecond,
		MaxBackoff:      time.Second,
		ShutdownTimeout: 200 * time.Millisecond,
	})
	if store.snapshot("j1").status != "SUCCEEDED" {
		t.Fatalf("expected success")
	}
	if handler.calls.Load() != 1 {
		t.Fatalf("handler calls = %d", handler.calls.Load())
	}
}

func TestStaleJobRecovery(t *testing.T) {
	now := time.Now()
	store := newMemoryStore(memJob{
		Job:      Job{ID: "stuck", Type: "ok", MaxAttempts: 5, Attempt: 1},
		status:   "RUNNING",
		lockedAt: now.Add(-10 * time.Minute),
	})
	handler := &countingHandler{typ: "ok"}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = Run(ctx, Runtime{
		Store:           store,
		Registry:        NewRegistry(handler),
		WorkerID:        "w2",
		Interval:        20 * time.Millisecond,
		BatchSize:       5,
		Concurrency:     1,
		LockTimeout:     5 * time.Minute,
		RetryBaseDelay:  time.Millisecond,
		MaxBackoff:      time.Second,
		ShutdownTimeout: 200 * time.Millisecond,
	})
	if store.snapshot("stuck").status != "SUCCEEDED" {
		t.Fatalf("stuck job was not recovered")
	}
	if handler.calls.Load() != 1 {
		t.Fatalf("handler calls = %d", handler.calls.Load())
	}
}

func TestBoundedConcurrencyManyJobs(t *testing.T) {
	var items []memJob
	for i := 0; i < 100; i++ {
		items = append(items, memJob{Job: Job{ID: fmt.Sprintf("j-%d", i), Type: "ok", MaxAttempts: 3}})
	}
	store := newMemoryStore(items...)
	handler := &countingHandler{typ: "ok"}
	var inFlight atomic.Int32
	var maxFlight atomic.Int32
	wrapped := HandlerFunc{typ: "ok", fn: func(ctx context.Context, job Job) error {
		cur := inFlight.Add(1)
		for {
			old := maxFlight.Load()
			if cur <= old || maxFlight.CompareAndSwap(old, cur) {
				break
			}
		}
		defer inFlight.Add(-1)
		return handler.Handle(ctx, job)
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = Run(ctx, Runtime{
		Store:           store,
		Registry:        NewRegistry(wrapped),
		WorkerID:        "w1",
		Interval:        5 * time.Millisecond,
		BatchSize:       20,
		Concurrency:     5,
		LockTimeout:     time.Minute,
		RetryBaseDelay:  time.Millisecond,
		MaxBackoff:      time.Second,
		ShutdownTimeout: 500 * time.Millisecond,
	})
	if handler.calls.Load() != 100 {
		t.Fatalf("processed = %d", handler.calls.Load())
	}
	if maxFlight.Load() > 5 {
		t.Fatalf("concurrency exceeded: %d", maxFlight.Load())
	}
	for _, item := range items {
		if store.snapshot(item.ID).status != "SUCCEEDED" {
			t.Fatalf("%s status = %s", item.ID, store.snapshot(item.ID).status)
		}
	}
}

func TestMultipleWorkersDrainQueue(t *testing.T) {
	var items []memJob
	for i := 0; i < 100; i++ {
		items = append(items, memJob{Job: Job{ID: fmt.Sprintf("mw-%d", i), Type: "ok", MaxAttempts: 3}})
	}
	store := newMemoryStore(items...)
	handler := &countingHandler{typ: "ok"}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			_ = Run(ctx, Runtime{
				Store:           store,
				Registry:        NewRegistry(handler),
				WorkerID:        fmt.Sprintf("w-%d", n),
				Interval:        5 * time.Millisecond,
				BatchSize:       10,
				Concurrency:     4,
				LockTimeout:     time.Minute,
				RetryBaseDelay:  time.Millisecond,
				MaxBackoff:      time.Second,
				ShutdownTimeout: 400 * time.Millisecond,
			})
		}(i)
	}
	wg.Wait()
	if handler.calls.Load() != 100 {
		t.Fatalf("processed = %d", handler.calls.Load())
	}
	for _, item := range items {
		if store.snapshot(item.ID).status != "SUCCEEDED" {
			t.Fatalf("%s status = %s", item.ID, store.snapshot(item.ID).status)
		}
	}
}

type HandlerFunc struct {
	typ string
	fn  func(context.Context, Job) error
}

func (h HandlerFunc) Type() string { return h.typ }

func (h HandlerFunc) Handle(ctx context.Context, job Job) error { return h.fn(ctx, job) }

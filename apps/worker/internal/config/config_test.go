package config

import (
	"testing"
	"time"
)

func TestLoadValidatesRequiredSettings(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://crm:crm@localhost:5432/crm?sslmode=disable")
	t.Setenv("WORKER_ID", "test-1")
	t.Setenv("JOB_BATCH_SIZE", "20")
	t.Setenv("WORKER_CONCURRENCY", "4")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.WorkerID != "test-1" || cfg.BatchSize != 20 || cfg.Concurrency != 4 {
		t.Fatalf("unexpected cfg %+v", cfg)
	}
	if cfg.RetryBaseDelay != 30*time.Second {
		t.Fatalf("base delay = %s", cfg.RetryBaseDelay)
	}
}

func TestLoadRejectsInvalidBatchSize(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgresql://crm:crm@localhost:5432/crm?sslmode=disable")
	t.Setenv("JOB_BATCH_SIZE", "999")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid batch size")
	}
}

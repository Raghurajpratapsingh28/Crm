package config

import (
	"os"
	"time"
)

type Config struct {
	DatabaseURL  string
	WorkerID     string
	PollInterval time.Duration
}

func Load() (Config, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		url = "postgresql://crm:crm@localhost:5432/crm?schema=public"
	}

	id := os.Getenv("WORKER_ID")
	if id == "" {
		id = "worker-1"
	}

	interval := 2 * time.Second
	if raw := os.Getenv("WORKER_POLL_INTERVAL_MS"); raw != "" {
		if ms, err := time.ParseDuration(raw + "ms"); err == nil {
			interval = ms
		}
	}

	return Config{
		DatabaseURL:  url,
		WorkerID:     id,
		PollInterval: interval,
	}, nil
}

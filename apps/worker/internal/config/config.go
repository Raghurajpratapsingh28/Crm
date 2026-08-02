package config

import (
	"fmt"
	"os"
	"strings"
	"time"
)

func containsSSLMode(url string) bool {
	return strings.Contains(strings.ToLower(url), "sslmode=")
}

type Config struct {
	DatabaseURL  string
	WorkerID     string
	PollInterval time.Duration
}

func Load() (Config, error) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		if os.Getenv("NODE_ENV") == "production" {
			return Config{}, fmt.Errorf("DATABASE_URL is required")
		}
		url = "postgresql://crm:crm@localhost:5432/crm?sslmode=disable"
	} else if os.Getenv("NODE_ENV") != "production" && !containsSSLMode(url) {
		sep := "?"
		if strings.Contains(url, "?") {
			sep = "&"
		}
		url += sep + "sslmode=disable"
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

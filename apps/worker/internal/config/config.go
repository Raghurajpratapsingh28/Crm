package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

func containsSSLMode(raw string) bool {
	return strings.Contains(strings.ToLower(raw), "sslmode=")
}

// postgresURLForDriver drops Prisma-only query params (schema=) that lib/pq rejects.
func postgresURLForDriver(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	query := parsed.Query()
	query.Del("schema")
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

type Config struct {
	DatabaseURL          string
	WorkerID             string
	PollInterval         time.Duration
	BatchSize            int
	Concurrency          int
	LockTimeout          time.Duration
	MaxAttempts          int
	RetryBaseDelay       time.Duration
	MaxBackoff           time.Duration
	RetryJitter          time.Duration
	ShutdownTimeout      time.Duration
	HealthPort           int
	DBMaxOpen            int
	DBMaxIdle            int
	CompletedRetention   time.Duration
	FailedRetention      time.Duration
	TaskRemindInterval   time.Duration
}

func Load() (Config, error) {
	url := postgresURLForDriver(os.Getenv("DATABASE_URL"))
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
		host, _ := os.Hostname()
		if host == "" {
			host = "worker"
		}
		id = fmt.Sprintf("%s-%d", host, os.Getpid())
	}

	cfg := Config{
		DatabaseURL:        url,
		WorkerID:           id,
		PollInterval:       envDuration([]string{"JOB_POLL_INTERVAL", "WORKER_POLL_INTERVAL"}, 2*time.Second),
		BatchSize:          envInt("JOB_BATCH_SIZE", 20),
		Concurrency:        envInt("WORKER_CONCURRENCY", 10),
		LockTimeout:        envDuration([]string{"JOB_LOCK_TIMEOUT"}, 5*time.Minute),
		MaxAttempts:        envInt("JOB_MAX_ATTEMPTS", 5),
		RetryBaseDelay:     envDuration([]string{"JOB_RETRY_BASE_DELAY"}, 30*time.Second),
		MaxBackoff:         envDuration([]string{"JOB_MAX_BACKOFF"}, time.Hour),
		RetryJitter:        envDuration([]string{"JOB_RETRY_JITTER"}, 5*time.Second),
		ShutdownTimeout:    envDuration([]string{"SHUTDOWN_TIMEOUT"}, 25*time.Second),
		HealthPort:         envInt("WORKER_HEALTH_PORT", 8081),
		DBMaxOpen:          envInt("DB_MAX_OPEN_CONNECTIONS", 10),
		DBMaxIdle:          envInt("DB_MAX_IDLE_CONNECTIONS", 5),
		CompletedRetention: envDuration([]string{"JOB_COMPLETED_RETENTION"}, 14*24*time.Hour),
		FailedRetention:    envDuration([]string{"JOB_FAILED_RETENTION"}, 90*24*time.Hour),
		TaskRemindInterval: envDuration([]string{"TASK_REMIND_INTERVAL"}, 5*time.Minute),
	}

	if raw := os.Getenv("WORKER_POLL_INTERVAL_MS"); raw != "" && os.Getenv("JOB_POLL_INTERVAL") == "" {
		if ms, err := time.ParseDuration(raw + "ms"); err == nil && ms > 0 {
			cfg.PollInterval = ms
		}
	}
	if raw := os.Getenv("TASK_REMIND_INTERVAL_MS"); raw != "" && os.Getenv("TASK_REMIND_INTERVAL") == "" {
		if ms, err := time.ParseDuration(raw + "ms"); err == nil && ms > 0 {
			cfg.TaskRemindInterval = ms
		}
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) Validate() error {
	if c.DatabaseURL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	if c.WorkerID == "" {
		return fmt.Errorf("WORKER_ID is required")
	}
	if c.PollInterval <= 0 {
		return fmt.Errorf("JOB_POLL_INTERVAL must be positive")
	}
	if c.BatchSize < 1 || c.BatchSize > 50 {
		return fmt.Errorf("JOB_BATCH_SIZE must be between 1 and 50")
	}
	if c.Concurrency < 1 {
		return fmt.Errorf("WORKER_CONCURRENCY must be at least 1")
	}
	if c.LockTimeout <= 0 {
		return fmt.Errorf("JOB_LOCK_TIMEOUT must be positive")
	}
	if c.MaxAttempts < 1 {
		return fmt.Errorf("JOB_MAX_ATTEMPTS must be at least 1")
	}
	if c.RetryBaseDelay <= 0 {
		return fmt.Errorf("JOB_RETRY_BASE_DELAY must be positive")
	}
	if c.MaxBackoff < c.RetryBaseDelay {
		return fmt.Errorf("JOB_MAX_BACKOFF must be >= JOB_RETRY_BASE_DELAY")
	}
	if c.ShutdownTimeout <= 0 {
		return fmt.Errorf("SHUTDOWN_TIMEOUT must be positive")
	}
	if c.DBMaxOpen < 1 {
		return fmt.Errorf("DB_MAX_OPEN_CONNECTIONS must be at least 1")
	}
	if c.DBMaxIdle < 0 {
		return fmt.Errorf("DB_MAX_IDLE_CONNECTIONS must be >= 0")
	}
	return nil
}

func envInt(key string, fallback int) int {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	n, err := strconv.Atoi(raw)
	if err != nil {
		return fallback
	}
	return n
}

func envDuration(keys []string, fallback time.Duration) time.Duration {
	for _, key := range keys {
		raw := strings.TrimSpace(os.Getenv(key))
		if raw == "" {
			continue
		}
		if d, err := time.ParseDuration(raw); err == nil && d > 0 {
			return d
		}
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			return time.Duration(n) * time.Millisecond
		}
	}
	return fallback
}

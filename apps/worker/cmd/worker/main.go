package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"crm/worker/internal/analytics"
	"crm/worker/internal/config"
	"crm/worker/internal/email"
	"crm/worker/internal/health"
	"crm/worker/internal/jobs"
	"crm/worker/internal/logging"
	"crm/worker/internal/notifications"
	"crm/worker/internal/payments"
	"crm/worker/internal/store"
	"crm/worker/internal/tasks"

	_ "github.com/lib/pq"
)

func main() {
	logging.Setup()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("worker_config_invalid", "error", err.Error())
		os.Exit(1)
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		slog.Error("worker_db_open", "error", err.Error())
		os.Exit(1)
	}
	db.SetMaxOpenConns(cfg.DBMaxOpen)
	db.SetMaxIdleConns(cfg.DBMaxIdle)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		cancelPing()
		_ = db.Close()
		slog.Error("worker_db_unavailable", "error", err.Error())
		os.Exit(1)
	}
	cancelPing()

	registry := jobs.NewRegistry(
		email.Handler{TypeName: jobs.EmailInvite},
		email.Handler{TypeName: jobs.EmailReceipt},
		email.Handler{TypeName: jobs.EmailFollowUp},
		notifications.Handler{DB: db},
		payments.EventHandler{DB: db},
		payments.Reconcile{DB: db},
		payments.SubscriptionReconcile{DB: db},
		payments.InvoiceReconcile{DB: db},
		payments.Dunning{DB: db},
		analytics.Rollup{},
		analytics.FlagStale{},
		tasks.Remind{DB: db},
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	healthSrv := health.Server(fmt.Sprintf(":%d", cfg.HealthPort), db)
	go func() {
		if err := healthSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("worker_health_server", "error", err.Error())
		}
	}()

	go func() {
		ticker := time.NewTicker(cfg.TaskRemindInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if _, err := tasks.Sweep(ctx, db, time.Now(), tasks.ReminderHours()); err != nil {
					slog.Error("task_reminder_sweep", "error", err.Error())
				}
			}
		}
	}()

	go func() {
		ticker := time.NewTicker(time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				n, err := (&store.Postgres{DB: db}).Purge(ctx, time.Now(), cfg.CompletedRetention, cfg.FailedRetention, 1000)
				if err != nil {
					slog.Error("job_purge", "error", err.Error())
					continue
				}
				if n > 0 {
					slog.Info("job_purged", "count", n)
				}
			}
		}
	}()

	slog.Info("worker_started",
		"worker_id", cfg.WorkerID,
		"poll_interval", cfg.PollInterval.String(),
		"batch_size", cfg.BatchSize,
		"concurrency", cfg.Concurrency,
		"lock_timeout", cfg.LockTimeout.String(),
	)

	runErr := jobs.Run(ctx, jobs.Runtime{
		Store:           &store.Postgres{DB: db},
		Registry:        registry,
		WorkerID:        cfg.WorkerID,
		Interval:        cfg.PollInterval,
		BatchSize:       cfg.BatchSize,
		Concurrency:     cfg.Concurrency,
		LockTimeout:     cfg.LockTimeout,
		RetryBaseDelay:  cfg.RetryBaseDelay,
		MaxBackoff:      cfg.MaxBackoff,
		RetryJitter:     cfg.RetryJitter,
		ShutdownTimeout: cfg.ShutdownTimeout,
	})
	stop()

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	_ = healthSrv.Shutdown(shutdownCtx)
	cancelShutdown()

	if err := db.Close(); err != nil {
		slog.Error("worker_db_close", "error", err.Error())
	}

	if runErr != nil {
		slog.Error("worker_exit", "error", runErr.Error())
		os.Exit(1)
	}
	slog.Info("worker_shutdown", "worker_id", cfg.WorkerID)
}

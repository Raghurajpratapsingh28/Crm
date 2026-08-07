package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"crm/worker/internal/analytics"
	"crm/worker/internal/config"
	"crm/worker/internal/email"
	"crm/worker/internal/jobs"
	"crm/worker/internal/notifications"
	"crm/worker/internal/payments"
	"crm/worker/internal/store"

	_ "github.com/lib/pq"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}

	pingCtx, cancelPing := context.WithTimeout(context.Background(), 5*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		cancelPing()
		_ = db.Close()
		log.Fatalf("database unavailable: %v", err)
	}
	cancelPing()

	registry := jobs.NewRegistry(
		email.Handler{TypeName: jobs.EmailInvite},
		email.Handler{TypeName: jobs.EmailReceipt},
		email.Handler{TypeName: jobs.EmailFollowUp},
		notifications.Handler{DB: db},
		payments.Reconcile{},
		payments.Dunning{},
		analytics.Rollup{},
		analytics.FlagStale{},
		analytics.RemindTasks{},
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("worker %s polling every %s", cfg.WorkerID, cfg.PollInterval)
	runErr := jobs.Run(ctx, &store.Postgres{DB: db}, registry, cfg.WorkerID, cfg.PollInterval)
	stop()

	if err := db.Close(); err != nil {
		log.Printf("close db: %v", err)
	}

	if runErr != nil {
		log.Fatal(runErr)
	}
	log.Printf("worker stopped")
}

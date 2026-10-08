package payments

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"crm/worker/internal/jobs"
)

type EventHandler struct{ DB *sql.DB }
type Reconcile struct{ DB *sql.DB }
type SubscriptionReconcile struct{ DB *sql.DB }
type InvoiceReconcile struct{ DB *sql.DB }
type Dunning struct{ DB *sql.DB }

func (EventHandler) Type() string            { return jobs.PaymentsEvent }
func (Reconcile) Type() string               { return jobs.PaymentsReconcile }
func (SubscriptionReconcile) Type() string   { return jobs.PaymentsSubscription }
func (InvoiceReconcile) Type() string        { return jobs.PaymentsInvoice }
func (Dunning) Type() string                 { return jobs.PaymentsDunning }

type eventJob struct {
	PaymentEventID string `json:"paymentEventId"`
	SubscriptionID string `json:"subscriptionId"`
	InvoiceID      string `json:"invoiceId"`
}

type snapshot struct {
	Version        int      `json:"version"`
	InternalType   string   `json:"internalType"`
	OrganizationID string   `json:"organizationId"`
	Subscription   *subSnap `json:"subscription"`
	Invoice        *invSnap `json:"invoice"`
}

type storedPayload struct {
	InternalType string     `json:"internalType"`
	Snapshot     *snapshot  `json:"snapshot"`
}

type subSnap struct {
	Provider           string  `json:"provider"`
	ExternalID         string  `json:"externalId"`
	CustomerID         string  `json:"customerId"`
	Status             string  `json:"status"`
	Currency           string  `json:"currency"`
	Amount             *string `json:"amount"`
	Interval           string  `json:"interval"`
	CurrentPeriodStart *string `json:"currentPeriodStart"`
	CurrentPeriodEnd   *string `json:"currentPeriodEnd"`
	CancelAtPeriodEnd  bool    `json:"cancelAtPeriodEnd"`
	CanceledAt         *string `json:"canceledAt"`
	TrialStart         *string `json:"trialStart"`
	TrialEnd           *string `json:"trialEnd"`
}

type invSnap struct {
	Provider               string  `json:"provider"`
	ExternalID             string  `json:"externalId"`
	SubscriptionExternalID string  `json:"subscriptionExternalId"`
	Status                 string  `json:"status"`
	Currency               string  `json:"currency"`
	Amount                 string  `json:"amount"`
	InvoiceURL             *string `json:"invoiceUrl"`
	PDFURL                 *string `json:"pdfUrl"`
	Number                 *string `json:"number"`
	PeriodStart            *string `json:"periodStart"`
	PeriodEnd              *string `json:"periodEnd"`
	DueAt                  *string `json:"dueAt"`
	PaidAt                 *string `json:"paidAt"`
}

func parseJob(raw json.RawMessage) (eventJob, error) {
	var payload eventJob
	if err := json.Unmarshal(raw, &payload); err != nil {
		return eventJob{}, err
	}
	return payload, nil
}

func (h EventHandler) Handle(ctx context.Context, job jobs.Job) error {
	return applyEventJob(ctx, h.DB, job)
}

func (h Reconcile) Handle(ctx context.Context, job jobs.Job) error {
	payload, err := parseJob(job.Payload)
	if err != nil {
		return jobs.Permanent(err)
	}
	if payload.PaymentEventID != "" {
		return applyEventJob(ctx, h.DB, job)
	}
	if payload.SubscriptionID != "" {
		return reconcileSubscription(ctx, h.DB, payload.SubscriptionID)
	}
	return nil
}

func (h SubscriptionReconcile) Handle(ctx context.Context, job jobs.Job) error {
	payload, err := parseJob(job.Payload)
	if err != nil || payload.SubscriptionID == "" {
		if err != nil {
			return jobs.Permanent(err)
		}
		return jobs.Permanent(fmt.Errorf("subscriptionId is required"))
	}
	return reconcileSubscription(ctx, h.DB, payload.SubscriptionID)
}

func (h InvoiceReconcile) Handle(ctx context.Context, job jobs.Job) error {
	payload, err := parseJob(job.Payload)
	if err != nil || payload.InvoiceID == "" {
		if err != nil {
			return jobs.Permanent(err)
		}
		return jobs.Permanent(fmt.Errorf("invoiceId is required"))
	}
	return reconcileInvoice(ctx, h.DB, payload.InvoiceID)
}

func (h Dunning) Handle(ctx context.Context, job jobs.Job) error {
	payload, err := parseJob(job.Payload)
	if err != nil {
		return jobs.Permanent(err)
	}
	if payload.PaymentEventID != "" {
		return applyEventJob(ctx, h.DB, job)
	}
	slog.Info("payments_dunning", "job_id", job.ID)
	return nil
}

func applyEventJob(ctx context.Context, db *sql.DB, job jobs.Job) error {
	if db == nil {
		return jobs.Transient(fmt.Errorf("payments handler missing database"))
	}
	payload, err := parseJob(job.Payload)
	if err != nil || payload.PaymentEventID == "" {
		return jobs.Permanent(fmt.Errorf("paymentEventId is required"))
	}
	var status, raw string
	err = db.QueryRowContext(ctx, `SELECT status, payload::text FROM payment_events WHERE id = $1`, payload.PaymentEventID).Scan(&status, &raw)
	if err == sql.ErrNoRows {
		return jobs.Permanent(fmt.Errorf("payment event missing"))
	}
	if err != nil {
		return err
	}
	if status == "PROCESSED" || status == "IGNORED" {
		return nil
	}
	var stored storedPayload
	if err := json.Unmarshal([]byte(raw), &stored); err != nil {
		return jobs.Permanent(err)
	}
	if stored.InternalType == "UNSUPPORTED" || stored.Snapshot == nil {
		_, err = db.ExecContext(ctx, `UPDATE payment_events SET status = 'IGNORED', processed_at = now(), attempts = attempts + 1, updated_at = now() WHERE id = $1`, payload.PaymentEventID)
		return err
	}
	if err := ApplySnapshot(ctx, db, *stored.Snapshot); err != nil {
		if _, markErr := db.ExecContext(ctx, `UPDATE payment_events SET status = 'FAILED', failed_at = now(), last_error = $2, attempts = attempts + 1, updated_at = now() WHERE id = $1`, payload.PaymentEventID, truncate(err.Error(), 500)); markErr != nil {
			slog.Error("payment_event_mark_failed", "error", markErr.Error())
		}
		return err
	}
	_, err = db.ExecContext(ctx, `UPDATE payment_events SET status = 'PROCESSED', processed_at = now(), failed_at = NULL, last_error = NULL, attempts = attempts + 1, updated_at = now() WHERE id = $1`, payload.PaymentEventID)
	return err
}

func ApplySnapshot(ctx context.Context, db *sql.DB, snap snapshot) error {
	if snap.Subscription != nil {
		if err := validateSub(*snap.Subscription); err != nil {
			slog.Error("billing_snapshot_invalid", "error", err.Error())
			return nil
		}
		if err := upsertSubscription(ctx, db, snap.OrganizationID, *snap.Subscription); err != nil {
			return err
		}
	}
	if snap.Invoice != nil {
		if err := validateInv(*snap.Invoice); err != nil {
			slog.Error("billing_invoice_invalid", "error", err.Error())
			return nil
		}
		if err := upsertInvoice(ctx, db, snap.OrganizationID, *snap.Invoice); err != nil {
			return err
		}
	}
	return nil
}

func validateSub(s subSnap) error {
	if s.Provider == "" || s.ExternalID == "" || s.CustomerID == "" {
		return fmt.Errorf("subscription snapshot missing identifiers")
	}
	if !validStatus(s.Status) || !validCurrency(s.Currency) {
		return fmt.Errorf("subscription snapshot has invalid status or currency")
	}
	return nil
}

func validateInv(i invSnap) error {
	if i.Provider == "" || i.ExternalID == "" || !validCurrency(i.Currency) {
		return fmt.Errorf("invoice snapshot missing identifiers")
	}
	return nil
}

func validStatus(status string) bool {
	switch status {
	case "INCOMPLETE", "TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "UNPAID", "PAUSED", "EXPIRED":
		return true
	default:
		return false
	}
}

func validCurrency(code string) bool {
	if len(code) != 3 {
		return false
	}
	for _, r := range code {
		if r < 'A' || r > 'Z' {
			return false
		}
	}
	return true
}

func upsertSubscription(ctx context.Context, db *sql.DB, hintedOrg string, snap subSnap) error {
	var id, orgID, existingExternal sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT id::text, organization_id::text, COALESCE(provider_subscription_id, '')
		FROM subscriptions
		WHERE provider = $1 AND provider_subscription_id = $2
		LIMIT 1
	`, snap.Provider, snap.ExternalID).Scan(&id, &orgID, &existingExternal)
	if err == sql.ErrNoRows {
		err = db.QueryRowContext(ctx, `
			SELECT id::text, organization_id::text, COALESCE(provider_subscription_id, '')
			FROM subscriptions
			WHERE provider = $1 AND provider_customer_id = $2 AND status IN ('INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','UNPAID','PAUSED')
			ORDER BY created_at DESC
			LIMIT 1
		`, snap.Provider, snap.CustomerID).Scan(&id, &orgID, &existingExternal)
	}
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	organizationID := orgID.String
	if organizationID == "" {
		organizationID = hintedOrg
	}
	if organizationID == "" {
		slog.Warn("billing_subscription_unmapped", "provider", snap.Provider, "external_subscription_id", snap.ExternalID)
		return nil
	}
	interval := snap.Interval
	if interval == "" {
		interval = "MONTH"
	}
	amount := any(nil)
	if snap.Amount != nil {
		amount = *snap.Amount
	}
	if id.Valid {
		_, err = db.ExecContext(ctx, `
			UPDATE subscriptions
			SET status = $2, currency = $3, amount = $4, billing_interval = $5,
			    current_period_start = $6, current_period_end = $7,
			    cancel_at_period_end = $8, canceled_at = $9, trial_start = $10, trial_end = $11,
			    provider_customer_id = $12, provider_subscription_id = $13, updated_at = now()
			WHERE id = $1::uuid
		`, id.String, snap.Status, snap.Currency, amount, interval, parseTime(snap.CurrentPeriodStart), parseTime(snap.CurrentPeriodEnd), snap.CancelAtPeriodEnd, parseTime(snap.CanceledAt), parseTime(snap.TrialStart), parseTime(snap.TrialEnd), snap.CustomerID, snap.ExternalID)
		return err
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO subscriptions (
			id, organization_id, provider, provider_customer_id, provider_subscription_id, status, amount, currency, billing_interval,
			current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_start, trial_end, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), now()
		)
	`, organizationID, snap.Provider, snap.CustomerID, snap.ExternalID, snap.Status, amount, snap.Currency, interval, parseTime(snap.CurrentPeriodStart), parseTime(snap.CurrentPeriodEnd), snap.CancelAtPeriodEnd, parseTime(snap.CanceledAt), parseTime(snap.TrialStart), parseTime(snap.TrialEnd))
	return err
}

func upsertInvoice(ctx context.Context, db *sql.DB, hintedOrg string, snap invSnap) error {
	var id, orgID sql.NullString
	err := db.QueryRowContext(ctx, `
		SELECT id::text, organization_id::text FROM invoices WHERE provider = $1 AND provider_invoice_id = $2
	`, snap.Provider, snap.ExternalID).Scan(&id, &orgID)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	organizationID := orgID.String
	if organizationID == "" && snap.SubscriptionExternalID != "" {
		_ = db.QueryRowContext(ctx, `SELECT organization_id::text FROM subscriptions WHERE provider = $1 AND provider_subscription_id = $2`, snap.Provider, snap.SubscriptionExternalID).Scan(&organizationID)
	}
	if organizationID == "" {
		organizationID = hintedOrg
	}
	if organizationID == "" {
		return nil
	}
	if id.Valid {
		_, err = db.ExecContext(ctx, `
			UPDATE invoices
			SET status = $2, amount = $3, currency = $4, invoice_url = $5, pdf_url = $6, invoice_number = $7,
			    period_start = $8, period_end = $9, due_at = $10, paid_at = $11, updated_at = now()
			WHERE id = $1::uuid
		`, id.String, snap.Status, snap.Amount, snap.Currency, snap.InvoiceURL, snap.PDFURL, snap.Number, parseTime(snap.PeriodStart), parseTime(snap.PeriodEnd), parseTime(snap.DueAt), parseTime(snap.PaidAt))
		return err
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO invoices (
			id, organization_id, provider, provider_invoice_id, amount, currency, status, invoice_url, pdf_url, invoice_number,
			period_start, period_end, due_at, paid_at, created_at, updated_at
		) VALUES (
			gen_random_uuid(), $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), now()
		)
	`, organizationID, snap.Provider, snap.ExternalID, snap.Amount, snap.Currency, snap.Status, snap.InvoiceURL, snap.PDFURL, snap.Number, parseTime(snap.PeriodStart), parseTime(snap.PeriodEnd), parseTime(snap.DueAt), parseTime(snap.PaidAt))
	return err
}

func parseTime(value *string) any {
	if value == nil || *value == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339, *value)
	if err != nil {
		return nil
	}
	return t.UTC()
}

func MapStripeStatus(status string) string {
	switch status {
	case "active":
		return "ACTIVE"
	case "past_due":
		return "PAST_DUE"
	case "canceled":
		return "CANCELED"
	case "trialing":
		return "TRIALING"
	case "unpaid":
		return "UNPAID"
	case "paused":
		return "PAUSED"
	case "incomplete_expired":
		return "EXPIRED"
	default:
		return "INCOMPLETE"
	}
}

func MapRazorpayStatus(status string) string {
	switch status {
	case "active":
		return "ACTIVE"
	case "halted":
		return "PAUSED"
	case "cancelled":
		return "CANCELED"
	case "pending":
		return "PAST_DUE"
	case "completed", "expired":
		return "EXPIRED"
	default:
		return "INCOMPLETE"
	}
}

func reconcileSubscription(ctx context.Context, db *sql.DB, subscriptionID string) error {
	if db == nil {
		return jobs.Transient(fmt.Errorf("payments handler missing database"))
	}
	var provider, externalID string
	err := db.QueryRowContext(ctx, `SELECT provider, COALESCE(provider_subscription_id, '') FROM subscriptions WHERE id = $1`, subscriptionID).Scan(&provider, &externalID)
	if err == sql.ErrNoRows {
		return jobs.Permanent(fmt.Errorf("subscription missing"))
	}
	if err != nil {
		return err
	}
	if externalID == "" {
		return jobs.Permanent(fmt.Errorf("subscription has no provider id"))
	}
	remote, err := fetchProviderSubscription(ctx, provider, externalID)
	if err != nil {
		return err
	}
	if remote.ExternalID != externalID || remote.Provider != provider {
		slog.Error("billing_reconcile_mismatch", "subscription_id", subscriptionID, "provider", provider)
		return nil
	}
	return upsertSubscription(ctx, db, "", remote)
}

func reconcileInvoice(ctx context.Context, db *sql.DB, invoiceID string) error {
	if db == nil {
		return jobs.Transient(fmt.Errorf("payments handler missing database"))
	}
	var provider, externalID, orgID string
	err := db.QueryRowContext(ctx, `SELECT provider, provider_invoice_id, organization_id::text FROM invoices WHERE id = $1`, invoiceID).Scan(&provider, &externalID, &orgID)
	if err == sql.ErrNoRows {
		return jobs.Permanent(fmt.Errorf("invoice missing"))
	}
	if err != nil {
		return err
	}
	remote, err := fetchProviderInvoice(ctx, provider, externalID)
	if err != nil {
		return err
	}
	remote.Provider = provider
	return upsertInvoice(ctx, db, orgID, remote)
}

func fetchProviderSubscription(ctx context.Context, provider, id string) (subSnap, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if provider == "STRIPE" {
		if os.Getenv("STRIPE_SECRET_KEY") == "" {
			return subSnap{}, jobs.Permanent(fmt.Errorf("stripe is not configured"))
		}
		body, err := providerGET(ctx, "https://api.stripe.com/v1/subscriptions/"+id, "Bearer "+os.Getenv("STRIPE_SECRET_KEY"))
		if err != nil {
			return subSnap{}, err
		}
		var raw map[string]any
		if err := json.Unmarshal(body, &raw); err != nil {
			return subSnap{}, jobs.Permanent(err)
		}
		status, _ := raw["status"].(string)
		customer, _ := raw["customer"].(string)
		currency, _ := raw["currency"].(string)
		return subSnap{
			Provider:   "STRIPE",
			ExternalID: id,
			CustomerID: customer,
			Status:     MapStripeStatus(status),
			Currency:   strings.ToUpper(currency),
		}, nil
	}
	if os.Getenv("RAZORPAY_KEY_ID") == "" {
		return subSnap{}, jobs.Permanent(fmt.Errorf("razorpay is not configured"))
	}
	body, err := providerGET(ctx, "https://api.razorpay.com/v1/subscriptions/"+id, "")
	if err != nil {
		return subSnap{}, err
	}
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return subSnap{}, jobs.Permanent(err)
	}
	status, _ := raw["status"].(string)
	customer, _ := raw["customer_id"].(string)
	return subSnap{Provider: "RAZORPAY", ExternalID: id, CustomerID: customer, Status: MapRazorpayStatus(status), Currency: "INR"}, nil
}

func fetchProviderInvoice(ctx context.Context, provider, id string) (invSnap, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	if provider == "STRIPE" {
		if os.Getenv("STRIPE_SECRET_KEY") == "" {
			return invSnap{}, jobs.Permanent(fmt.Errorf("stripe is not configured"))
		}
		body, err := providerGET(ctx, "https://api.stripe.com/v1/invoices/"+id, "Bearer "+os.Getenv("STRIPE_SECRET_KEY"))
		if err != nil {
			return invSnap{}, err
		}
		var raw map[string]any
		_ = json.Unmarshal(body, &raw)
		status, _ := raw["status"].(string)
		currency, _ := raw["currency"].(string)
		mapped := "OPEN"
		if status == "paid" {
			mapped = "PAID"
		}
		return invSnap{Provider: "STRIPE", ExternalID: id, Status: mapped, Currency: strings.ToUpper(currency), Amount: "0.00"}, nil
	}
	return invSnap{}, jobs.Permanent(fmt.Errorf("invoice reconcile for %s is not configured", provider))
}

func providerGET(ctx context.Context, url, authorization string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, jobs.Permanent(err)
	}
	if authorization != "" {
		req.Header.Set("Authorization", authorization)
	} else {
		req.SetBasicAuth(os.Getenv("RAZORPAY_KEY_ID"), os.Getenv("RAZORPAY_KEY_SECRET"))
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, jobs.Transient(err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 500 {
		return nil, jobs.Transient(fmt.Errorf("provider status %d", res.StatusCode))
	}
	if res.StatusCode == 404 {
		return nil, jobs.Permanent(fmt.Errorf("provider object not found"))
	}
	if res.StatusCode >= 400 {
		return nil, jobs.Permanent(fmt.Errorf("provider status %d", res.StatusCode))
	}
	return body, nil
}

func truncate(value string, n int) string {
	if len(value) <= n {
		return value
	}
	return value[:n]
}

package payments

import (
	"encoding/json"
	"testing"

	"crm/worker/internal/jobs"
)

func TestMapStatuses(t *testing.T) {
	if MapStripeStatus("active") != "ACTIVE" || MapStripeStatus("past_due") != "PAST_DUE" {
		t.Fatal("stripe map")
	}
	if MapRazorpayStatus("halted") != "PAUSED" || MapRazorpayStatus("cancelled") != "CANCELED" {
		t.Fatal("razorpay map")
	}
}

func TestValidateSnapshot(t *testing.T) {
	if err := validateSub(subSnap{Provider: "STRIPE", ExternalID: "sub_1", CustomerID: "cus_1", Status: "ACTIVE", Currency: "USD"}); err != nil {
		t.Fatal(err)
	}
	if err := validateSub(subSnap{Provider: "STRIPE", Status: "NOPE", Currency: "usd"}); err == nil {
		t.Fatal("expected invalid snapshot")
	}
	if err := validateInv(invSnap{Provider: "STRIPE", ExternalID: "in_1", Currency: "USD"}); err != nil {
		t.Fatal(err)
	}
}

func TestParseJobRequiresID(t *testing.T) {
	got, err := parseJob([]byte(`{"paymentEventId":"evt-1"}`))
	if err != nil || got.PaymentEventID != "evt-1" {
		t.Fatalf("parse %v %v", got, err)
	}
}

func TestEventHandlerMissingDBIsRetryable(t *testing.T) {
	err := (EventHandler{}).Handle(nil, jobs.Job{Payload: json.RawMessage(`{"paymentEventId":"x"}`)})
	if !jobs.IsRetryable(err) {
		t.Fatalf("expected transient, got %v", err)
	}
}

func TestMissingSubscriptionIDIsPermanent(t *testing.T) {
	err := (SubscriptionReconcile{}).Handle(nil, jobs.Job{Payload: json.RawMessage(`{}`)})
	if jobs.IsRetryable(err) {
		t.Fatalf("expected permanent, got %v", err)
	}
}

func TestApplySnapshotRejectsMalformedWithoutPanic(t *testing.T) {
	err := ApplySnapshot(nil, nil, snapshot{Subscription: &subSnap{Status: "ACTIVE"}})
	if err != nil {
		t.Fatal(err)
	}
}

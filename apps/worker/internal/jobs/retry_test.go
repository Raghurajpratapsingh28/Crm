package jobs

import (
	"testing"
	"time"
)

func TestBackoffExponentialCapped(t *testing.T) {
	base := 30 * time.Second
	max := time.Hour
	if got := Backoff(1, base, max, 0); got != 30*time.Second {
		t.Fatalf("attempt 1 = %s", got)
	}
	if got := Backoff(2, base, max, 0); got != 60*time.Second {
		t.Fatalf("attempt 2 = %s", got)
	}
	if got := Backoff(3, base, max, 0); got != 120*time.Second {
		t.Fatalf("attempt 3 = %s", got)
	}
	if got := Backoff(5, base, max, 0); got != 480*time.Second {
		t.Fatalf("attempt 5 = %s", got)
	}
	if got := Backoff(20, base, max, 0); got != max {
		t.Fatalf("capped = %s", got)
	}
}

func TestBackoffJitterIsBounded(t *testing.T) {
	base := 30 * time.Second
	jitter := 5 * time.Second
	got := Backoff(1, base, time.Hour, jitter)
	if got < base || got > base+jitter {
		t.Fatalf("jittered delay %s out of range", got)
	}
}

func TestTruncateError(t *testing.T) {
	err := Permanent(errString("abcdefghijklmnopqrstuvwxyz"))
	if got := TruncateError(err, 8); got != "abcdefgh" {
		t.Fatalf("truncated = %q", got)
	}
}

type errString string

func (e errString) Error() string { return string(e) }

func TestRetryableClassification(t *testing.T) {
	if IsRetryable(Permanent(errString("bad payload"))) {
		t.Fatal("permanent should not retry")
	}
	if !IsRetryable(Transient(errString("timeout"))) {
		t.Fatal("transient should retry")
	}
	if !IsRetryable(errString("plain")) {
		t.Fatal("unclassified errors retry")
	}
	if IsRetryable(UnknownType("nope")) {
		t.Fatal("unknown type should not retry")
	}
}

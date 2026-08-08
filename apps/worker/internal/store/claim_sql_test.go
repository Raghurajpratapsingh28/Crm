package store

import (
	"strings"
	"testing"
)

func TestClaimSQLUsesSkipLocked(t *testing.T) {
	sql := strings.ToUpper(ClaimSQL)
	if !strings.Contains(sql, "FOR UPDATE SKIP LOCKED") {
		t.Fatal("claim query must use FOR UPDATE SKIP LOCKED")
	}
	if !strings.Contains(sql, "STATUS = 'PENDING'") {
		t.Fatal("claim query must select pending jobs")
	}
	if !strings.Contains(sql, "STATUS = 'RUNNING'") {
		t.Fatal("claim query must recover stale running jobs")
	}
	if !strings.Contains(sql, "LIMIT") {
		t.Fatal("claim query must be bounded")
	}
}

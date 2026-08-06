package email

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSafeInviteSummaryOmitsToken(t *testing.T) {
	payload := InvitePayload{
		InvitationID:     "inv-1",
		OrganizationName: "Acme",
		Email:            "a@example.com",
		Role:             "MEMBER",
		InviterName:      "Ada",
		ExpiresAt:        "2026-08-12",
		AcceptURL:        "https://app.example.com/invitations/super-secret-token",
	}
	summary := SafeInviteSummary(payload)
	if strings.Contains(summary, "super-secret-token") || strings.Contains(summary, "acceptUrl") {
		t.Fatalf("summary leaked invitation token: %s", summary)
	}
	if !strings.Contains(summary, "inv-1") {
		t.Fatalf("summary should include invitation id: %s", summary)
	}
}

func TestParseInvitePayloadRequiresFields(t *testing.T) {
	_, err := ParseInvitePayload([]byte(`{"email":"a@example.com"}`))
	if err == nil {
		t.Fatal("expected missing-field error")
	}
	raw, _ := json.Marshal(InvitePayload{
		InvitationID: "inv-1",
		Email:        "a@example.com",
		AcceptURL:    "https://app.example.com/invitations/token",
	})
	got, err := ParseInvitePayload(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.InvitationID != "inv-1" {
		t.Fatalf("unexpected payload %+v", got)
	}
}

func TestRenderInviteEmail(t *testing.T) {
	dept := "SALES"
	body := RenderInviteEmail(InvitePayload{
		OrganizationName: "Acme Inc.",
		InviterName:      "Ada Admin",
		Role:             "MEMBER",
		Department:       &dept,
		AcceptURL:        "https://app.example.com/invitations/token",
		ExpiresAt:        "2026-08-12T00:00:00Z",
	})
	for _, want := range []string{"Acme Inc.", "Ada Admin", "MEMBER", "SALES", "Accept invitation", "2026-08-12"} {
		if !strings.Contains(body, want) {
			t.Fatalf("missing %q in %q", want, body)
		}
	}
}

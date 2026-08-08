package notifications

import (
	"encoding/json"
	"testing"
)

func TestParseFanoutPayloadRequiresFields(t *testing.T) {
	if _, err := ParseFanoutPayload([]byte(`{"type":"DEAL_STAGE_CHANGED"}`)); err == nil {
		t.Fatal("expected missing-field error")
	}
	raw, _ := json.Marshal(FanoutPayload{
		OrganizationID: "org-1",
		UserID:         "user-1",
		Type:           "LEAD_ASSIGNED",
		Payload:        json.RawMessage(`{"dealId":"deal-1","name":"Acme"}`),
	})
	got, err := ParseFanoutPayload(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != "user-1" || got.Type != "LEAD_ASSIGNED" {
		t.Fatalf("unexpected payload %+v", got)
	}
	if got.Title != "Deal assigned" || got.EntityType != "DEAL" || got.EntityID != "deal-1" {
		t.Fatalf("copy not generated: %+v", got)
	}
}

func TestStageCopyUsesHistoricalStages(t *testing.T) {
	copy := Content("DEAL_STAGE_CHANGED", json.RawMessage(`{"dealId":"d1","name":"Acme","fromStage":"Proposal","toStage":"Negotiation"}`))
	if copy.Title != "Deal moved to Negotiation" {
		t.Fatalf("title = %s", copy.Title)
	}
	if copy.Message != `"Acme" moved from Proposal to Negotiation.` {
		t.Fatalf("message = %s", copy.Message)
	}
}

func TestDedupeKeyFallback(t *testing.T) {
	payload, err := ParseFanoutPayload([]byte(`{"organizationId":"o","userId":"u","type":"TASK_ASSIGNED","payload":{"taskId":"t1","title":"Call"}}`))
	if err != nil {
		t.Fatal(err)
	}
	if payload.Title != "New task assigned" {
		t.Fatalf("title = %s", payload.Title)
	}
}

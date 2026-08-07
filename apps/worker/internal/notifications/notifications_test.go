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
		Payload:        json.RawMessage(`{"dealId":"deal-1"}`),
	})
	got, err := ParseFanoutPayload(raw)
	if err != nil {
		t.Fatal(err)
	}
	if got.UserID != "user-1" || got.Type != "LEAD_ASSIGNED" {
		t.Fatalf("unexpected payload %+v", got)
	}
}

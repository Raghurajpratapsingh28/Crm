package email

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/smtp"
	"os"
	"strings"

	"crm/worker/internal/jobs"
)

type Handler struct{ TypeName string }

type InvitePayload struct {
	InvitationID     string  `json:"invitationId"`
	OrganizationName string  `json:"organizationName"`
	Email            string  `json:"email"`
	Role             string  `json:"role"`
	Department       *string `json:"department"`
	InviterName      string  `json:"inviterName"`
	ExpiresAt        string  `json:"expiresAt"`
	AcceptURL        string  `json:"acceptUrl"`
}

func (h Handler) Type() string { return h.TypeName }

func (h Handler) Handle(_ context.Context, job jobs.Job) error {
	if job.Type == jobs.EmailInvite {
		return handleInvite(job)
	}
	slog.Info("email_job", "job_id", job.ID, "job_type", job.Type)
	return nil
}

func handleInvite(job jobs.Job) error {
	payload, err := ParseInvitePayload(job.Payload)
	if err != nil {
		return jobs.Permanent(err)
	}
	slog.Info("email_job", "job_id", job.ID, "job_type", job.Type, "summary", SafeInviteSummary(payload))
	subject := fmt.Sprintf("You have been invited to join %s", payload.OrganizationName)
	return sendMail(payload.Email, subject, RenderInviteEmail(payload))
}

func ParseInvitePayload(raw json.RawMessage) (InvitePayload, error) {
	var payload InvitePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return InvitePayload{}, err
	}
	if payload.InvitationID == "" || payload.Email == "" || payload.AcceptURL == "" {
		return InvitePayload{}, fmt.Errorf("invite payload missing required fields")
	}
	return payload, nil
}

func SafeInviteSummary(payload InvitePayload) string {
	return fmt.Sprintf("invitationId=%s organization=%s role=%s", payload.InvitationID, payload.OrganizationName, payload.Role)
}

func RenderInviteEmail(payload InvitePayload) string {
	department := "—"
	if payload.Department != nil && *payload.Department != "" {
		department = *payload.Department
	}
	return fmt.Sprintf(
		"You have been invited to join %s\nInvited by %s\nRole: %s\nDepartment: %s\nAccept invitation: %s\nInvitation expires on %s\n",
		payload.OrganizationName,
		payload.InviterName,
		payload.Role,
		department,
		payload.AcceptURL,
		payload.ExpiresAt,
	)
}

func sendMail(to, subject, body string) error {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		slog.Info("email_skipped", "reason", "no_smtp_host", "to", redactEmail(to), "subject", subject)
		return nil
	}
	port := os.Getenv("SMTP_PORT")
	if port == "" {
		port = "587"
	}
	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = "noreply@localhost"
	}
	user := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	addr := host + ":" + port
	msg := []byte("To: " + to + "\r\nSubject: " + subject + "\r\n\r\n" + body)
	var auth smtp.Auth
	if user != "" {
		auth = smtp.PlainAuth("", user, pass, host)
	}
	return smtp.SendMail(addr, auth, from, []string{to}, msg)
}

func redactEmail(email string) string {
	at := strings.LastIndex(email, "@")
	if at <= 1 {
		return "***"
	}
	return email[:1] + "***" + email[at:]
}

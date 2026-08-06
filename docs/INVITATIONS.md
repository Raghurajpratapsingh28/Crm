# Invitations

## Lifecycle

```text
ADMIN
  → POST /api/v1/team/invitations
  → hash token, store token_hash, enqueue email.invite
  → Go worker sends email (or skips if SMTP_HOST is unset)
  → Recipient opens /invitations/<token>
  → Sign in / sign up with the invited email
  → POST /api/v1/team/invitations/<token>/accept
  → ACTIVE membership + MEMBER_JOINED audit
```

Statuses: `PENDING`, `EXPIRED` (7 days by default), `CANCELLED`, `ACCEPTED`.

`INVITATION_TTL_DAYS` and `INVITATION_RESEND_COOLDOWN_SECONDS` are env-configurable.

## Security

- Raw tokens are 32 random bytes, base64url encoded.
- Only SHA-256 `token_hash` is stored. Lookups use the same hash and `timingSafeEqual`.
- Raw tokens are never written to audit logs, analytics, or invitation API responses.
- Request logs redact `/invitations/<token>` paths.
- The worker logs `invitationId` and organization name, never `acceptUrl`.
- Accept requires a Supabase JWT whose email matches the invitation email.
- Duplicate pending invites for the same org+email are rejected. Expired pending rows are cancelled and replaced.
- Resend rotates the hash so the previous link dies.
- Cancel overwrites the hash and sets `cancelled_at`.
- Create / resend / accept / preview are rate limited.

## Email worker

Job type: `email.invite` (existing `JobType`). Payload includes `invitationId`, safe display fields, and `acceptUrl` for delivery only. The Go handler must not log the payload.

If `SMTP_HOST` is unset, the job succeeds after a safe log line so local development does not fail.

## Frontend

- `/team` list + pending invitations
- `/team/invite` form
- `/team/[memberId]` profile, assigned counts, activity, confirmations
- `/invitations/[token]` public preview + accept
- `/settings` org name, timezone, currency, id (read-only without `organization.update`)

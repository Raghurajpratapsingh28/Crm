# Webhooks

Payment webhooks are unauthenticated. Cryptographic signatures are the control. IP allowlists are optional extras, never the only check.

```text
Provider
  → POST /webhooks/stripe | /webhooks/razorpay
  → express.raw (256kb)  // mounted before express.json
  → verify signature (SDK / HMAC)
  → reject unsigned/tampered (do not persist)
  → unique (provider, provider_event_id)
  → persist redacted payload + normalized snapshot
  → enqueue payments.event in the same transaction
  → 200 quickly
  → Go worker applies snapshot
```

## Raw body

Signature verification uses the bytes Stripe/Razorpay signed. The JSON parser is not applied to these routes. Re-stringifying `req.body` after `express.json()` is not equivalent.

## Idempotency

Replays of the same event id return 200. Already `PROCESSED` or `IGNORED` events are not applied again. `FAILED`/`RECEIVED` events may be re-queued.

Business effects (subscription row, invoice row, notification `dedupe_key`, audit) must survive five deliveries of `evt_123`.

## Unknown vs invalid

| Case | Response | Storage |
| --- | --- | --- |
| Bad signature | 400 `INVALID_WEBHOOK` | none |
| Known event | 200 | `RECEIVED` then worker `PROCESSED` |
| Signed but unused type | 200 | `IGNORED` |
| Duplicate | 200 `{ duplicate: true }` | existing row |

Do not retry ignored types forever.

## Mapping

Organization is resolved from `provider + external_subscription_id`, then customer id, then `billing_checkouts.session_id`. Payload `organizationId` is not used to attach a foreign tenant.

After processing, the internal database is what `/billing` reads. Reconciliation (`payments.subscription`) fetches the provider when webhooks were missed. Malformed provider payloads are logged and must not wipe a valid local row.

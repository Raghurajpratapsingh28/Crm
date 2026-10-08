# Billing

Organization-level subscriptions. Users never own a subscription. The CRM talks to `BillingService` and `PaymentProvider`; it does not call Stripe or Razorpay from controllers, the web app, or ad-hoc SQL.

## Architecture

```text
Admin
  → Next.js /billing
  → POST /api/v1/billing/checkout
  → Auth + tenant + billing.manage
  → BillingService (trusted plan catalog)
  → PaymentProvider adapter (Stripe | Razorpay | Fake in tests)
  → Provider-hosted checkout
  → POST /webhooks/stripe or /webhooks/razorpay (raw body + signature)
  → payment_events (unique provider + event id)
  → jobs.payments.event
  → Go worker applies normalized snapshot
  → subscriptions / invoices / audit / notifications
```

A browser redirect is **not** payment confirmation. `/billing/success` only polls `GET /api/v1/billing/subscription`. Query flags such as `?payment=success` are ignored.

Webhook metadata `organizationId` is never trusted as tenant assignment. Mapping is `provider + external subscription/customer id` or a stored checkout session.

## Data model

Money is stored as `Decimal(14,2)` **major units** (`1999.00` INR). Adapters convert to integer minor units for provider APIs (paise/cents). Currency is ISO 4217 uppercase.

| Model | Role |
| --- | --- |
| `BillingPlan` | Catalog. Provider price IDs live here, not in the client. |
| `Subscription` | Internal subscription. Provider ids are references, not primary keys. |
| `Invoice` | Provider invoices mapped to an internal status. |
| `PaymentEvent` | Verified webhooks. Idempotent on `(provider, provider_event_id)`. |
| `BillingCheckout` | Idempotency-Key replay for checkout. |

Organization deletion does **not** cascade billing history (`ON DELETE RESTRICT`). Keep invoices and payment events for audit. `Organization.plan` (`FREE`/`STARTER`/`GROWTH`) is an entitlement flag, not the sellable catalog.

One **open** subscription per organization is enforced with a partial unique index:

```sql
UNIQUE (organization_id) WHERE status IN (
  'INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','UNPAID','PAUSED'
)
```

Canceled and expired rows remain as history. Switching providers while a blocking subscription exists is rejected (`SUBSCRIPTION_ALREADY_ACTIVE`). Plan changes after checkout are not in this milestone.

## API

Tenant always comes from the JWT membership. `organizationId` in the body is rejected.

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/billing/plans` | Authenticated (active plans only; no provider secrets) |
| GET | `/api/v1/billing/subscription` | `billing.read` (ADMIN). `subscription: null` if none |
| GET | `/api/v1/billing` | `billing.read` overview |
| POST | `/api/v1/billing/checkout` | `billing.manage` |
| POST | `/api/v1/billing/subscription/cancel` | `billing.manage` (default: cancel at period end) |
| POST | `/api/v1/billing/subscription/reactivate` | `billing.manage` (Stripe scheduled cancel only) |
| GET | `/api/v1/billing/invoices` | `billing.read` paginated |
| GET | `/api/v1/billing/invoices/:id` | `billing.read` tenant-scoped (foreign ids → 404) |
| POST | `/api/v1/billing/reconcile` | `billing.manage` enqueue live fetch |
| POST | `/webhooks/stripe` | Signature, no JWT |
| POST | `/webhooks/razorpay` | Signature, no JWT |

Checkout body: `{ planId, provider, billingInterval }`. `amount`, `currency`, and provider price ids from the client are ignored or rejected. Send `Idempotency-Key` to replay a checkout attempt.

## Status maps

See `docs/STRIPE.md` and `docs/RAZORPAY.md`. Internal subscription statuses: `INCOMPLETE`, `TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELED`, `UNPAID`, `PAUSED`, `EXPIRED`. Invoice: `DRAFT`, `OPEN`, `PAID`, `VOID`, `UNCOLLECTIBLE`, `FAILED`.

Provider state is authoritative. The frontend reads the internal database only.

## Jobs

| Type | Purpose |
| --- | --- |
| `payments.event` | Apply a stored normalized snapshot |
| `payments.reconcile` | Alias: event id or subscription id |
| `payments.subscription` | Live provider fetch + apply |
| `payments.invoice` | Live invoice fetch |
| `payments.dunning` | Failed payment follow-up (idempotent with the event) |
| `notification.fanout` | In-app billing copy |
| `email.receipt` | Failed-payment / past-due email |

Jobs carry ids, not raw provider payloads. Worker retries follow the existing queue policy. Permanent errors (missing ids, unknown objects, unconfigured provider) are not retried forever.

## Security

- ADMIN: `billing.read` + `billing.manage`. MANAGER/MEMBER: neither.
- Secrets stay on the API and worker. Next.js may only receive `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_RAZORPAY_KEY_ID` if embedded checkout is added later. Redirect checkout uses server-returned URLs.
- Webhooks: HTTPS, raw body, 256kb limit, HMAC/SDK verification, unique event id, async processing.
- No PAN, CVV, bank credentials, or provider secret keys are stored.
- A Stripe outage must not take down CRM CRUD. `/ready` does not ping providers.

## Local development

1. Copy `.env.example`. Leave provider keys empty to use the API without live charges; tests use `FakePaymentProvider`.
2. Seed plans: `pnpm db:seed` (test price ids only).
3. Stripe CLI: `stripe listen --forward-to localhost:4000/webhooks/stripe`
4. Razorpay dashboard → webhook URL `http://localhost:4000/webhooks/razorpay` (or a tunnel).
5. Never mix live keys with `price_test_*` / `plan_test_*` seeds.

Production webhook URLs are `https://<api-host>/webhooks/stripe` and `https://<api-host>/webhooks/razorpay`.

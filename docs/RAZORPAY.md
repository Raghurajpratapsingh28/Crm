# Razorpay

Server-only adapter: `apps/api/src/lib/payments/razorpay-provider.ts`. REST + Basic auth. `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` are never sent to the browser.

## Dashboard setup

1. Create Plans in **test/sandbox** (monthly and yearly).
2. Store ids on `billing_plans.razorpay_plan_id_month` / `razorpay_plan_id_year`.
3. Keys: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. Optional `NEXT_PUBLIC_RAZORPAY_KEY_ID` only if Checkout.js is added later. This milestone redirects to `short_url` from `POST /v1/subscriptions`.

Razorpay objects are not Stripe objects. The adapter maps Customer / Plan / Subscription / Payment / Invoice into the internal model.

## Webhook

Endpoint: `POST /webhooks/razorpay`  
Header: `X-Razorpay-Signature` (HMAC-SHA256 of the **raw** body with `RAZORPAY_WEBHOOK_SECRET`).  
Idempotency: `X-Razorpay-Event-Id` when present, otherwise the verified payload id.

Local testing: use a public tunnel to the API, or Razorpay’s test webhook tools. There is no official equivalent of `stripe listen`; do not invent one.

Production: `https://<api-host>/webhooks/razorpay`.

## Supported events

| Razorpay event | Internal |
| --- | --- |
| `subscription.authenticated` | `SUBSCRIPTION_UPDATED` |
| `subscription.activated` | `SUBSCRIPTION_CREATED` |
| `subscription.charged` | `SUBSCRIPTION_RENEWED` |
| `subscription.pending` | `SUBSCRIPTION_UPDATED` (`PAST_DUE`) |
| `subscription.halted` | `SUBSCRIPTION_UPDATED` (`PAUSED`) |
| `subscription.cancelled` | `SUBSCRIPTION_CANCELED` |
| `subscription.completed` | `SUBSCRIPTION_UPDATED` (`EXPIRED`) |
| `invoice.paid` | `INVOICE_PAID` |
| `invoice.expired` | `INVOICE_FAILED` |
| `payment.failed` | `PAYMENT_FAILED` |

Unknown signed events are persisted as `IGNORED`.

## Status map

| Razorpay | Internal |
| --- | --- |
| `created` / `authenticated` | `INCOMPLETE` |
| `active` | `ACTIVE` |
| `pending` | `PAST_DUE` |
| `halted` | `PAUSED` |
| `cancelled` | `CANCELED` |
| `completed` / `expired` | `EXPIRED` |

Invoices: `draft→DRAFT`, `issued`/`partially_paid→OPEN`, `paid→PAID`, `cancelled`/`expired→VOID`.

Cancel uses `POST /subscriptions/:id/cancel` with `cancel_at_cycle_end=1` unless immediate. Razorpay does not expose a safe reverse of scheduled cancellation; `POST /billing/subscription/reactivate` returns `CANNOT_REACTIVATE_SUBSCRIPTION`.

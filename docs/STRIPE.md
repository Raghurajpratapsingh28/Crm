# Stripe

Server-only adapter: `apps/api/src/lib/payments/stripe-provider.ts`. Secret key and webhook secret never leave the API/worker.

## Dashboard setup

1. Create Products and recurring Prices (monthly and yearly) in **test mode** first.
2. Put Price ids on `billing_plans.stripe_price_id_month` / `stripe_price_id_year` (database or seed). Do not hardcode live ids in source.
3. API keys: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Optional `STRIPE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for hosted.js only.
4. Checkout uses Checkout Sessions in `mode=subscription`. Success URL is `/billing/success`. The app does not mark the subscription paid on redirect.

## Webhook

Endpoint: `POST /webhooks/stripe`  
Header: `Stripe-Signature`  
Verify with `Stripe.webhooks.constructEvent` and `STRIPE_WEBHOOK_SECRET`.

Local: `stripe listen --forward-to localhost:4000/webhooks/stripe` and copy the CLI signing secret into `STRIPE_WEBHOOK_SECRET`.

Production: Dashboard → Developers → Webhooks → `https://<api-host>/webhooks/stripe` (test and live endpoints are separate; do not mix keys).

## Supported events

| Stripe event | Internal |
| --- | --- |
| `checkout.session.completed` | `SUBSCRIPTION_CREATED` |
| `customer.subscription.created` | `SUBSCRIPTION_CREATED` |
| `customer.subscription.updated` | `SUBSCRIPTION_UPDATED` |
| `customer.subscription.deleted` | `SUBSCRIPTION_CANCELED` |
| `customer.subscription.paused` | `SUBSCRIPTION_UPDATED` |
| `invoice.created` / `invoice.finalized` | `INVOICE_CREATED` |
| `invoice.paid` / `invoice.payment_succeeded` | `INVOICE_PAID` |
| `invoice.payment_failed` | `INVOICE_FAILED` |

Other signed events are stored as `IGNORED` and acknowledged.

## Status map

| Stripe | Internal |
| --- | --- |
| `incomplete` | `INCOMPLETE` |
| `incomplete_expired` | `EXPIRED` |
| `trialing` | `TRIALING` |
| `active` | `ACTIVE` |
| `past_due` | `PAST_DUE` |
| `canceled` | `CANCELED` |
| `unpaid` | `UNPAID` |
| `paused` | `PAUSED` |

Invoices: `draft→DRAFT`, `open→OPEN`, `paid→PAID`, `void→VOID`, `uncollectible→UNCOLLECTIBLE`.

Cancellation defaults to `cancel_at_period_end`. Immediate cancel uses `subscriptions.cancel`. Reactivate clears `cancel_at_period_end`.

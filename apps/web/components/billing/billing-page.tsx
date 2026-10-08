"use client";

import type { BillingInterval, BillingInvoice, BillingPlanPublic, BillingSubscription, CheckoutResponse, PaymentProvider } from "@crm/types";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth-provider";
import { DataTable } from "../crm/data-table";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState, Pagination } from "../crm/ui";
import { apiFetch, ApiRequestError } from "../../lib/api";
import { formatBillingDate, formatMoney, INVOICE_LABELS, intervalLabel, renewalCopy, SUBSCRIPTION_LABELS } from "../../lib/billing";
import { crmErrorMessage } from "../../lib/crm-errors";
import { PERMISSIONS } from "../../lib/permissions";

type PlansResponse = { plans: BillingPlanPublic[]; providers: PaymentProvider[] };
type SubscriptionResponse = { subscription: BillingSubscription | null };
type InvoiceList = { items: BillingInvoice[]; pagination: { page: number; totalPages: number; total: number } };

export function BillingPage({ confirming = false }: { confirming?: boolean }) {
  const { session, organization, can } = useAuth();
  const token = session?.access_token;
  const timeZone = organization?.timezone ?? "UTC";
  const manage = can(PERMISSIONS.BILLING_MANAGE);
  const router = useRouter();

  const [plans, setPlans] = useState<BillingPlanPublic[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscription | null>(null);
  const [invoices, setInvoices] = useState<InvoiceList | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("MONTH");
  const [provider, setProvider] = useState<PaymentProvider>("STRIPE");
  const [pending, setPending] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function load(nextPage = page) {
    if (!token) return;
    setLoading(true);
    try {
      const [planRes, subRes, invoiceRes] = await Promise.all([
        apiFetch<PlansResponse>("/api/v1/billing/plans", { token }),
        apiFetch<SubscriptionResponse>("/api/v1/billing/subscription", { token }),
        apiFetch<InvoiceList>(`/api/v1/billing/invoices?page=${nextPage}&limit=10`, { token }),
      ]);
      setPlans(planRes.plans);
      setProviders(planRes.providers);
      setSubscription(subRes.subscription);
      setInvoices(invoiceRes);
      if (!planId && planRes.plans[0]) setPlanId(planRes.plans[0].id);
      if (planRes.providers[0] && !planRes.providers.includes(provider)) setProvider(planRes.providers[0]);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load billing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiFetch<PlansResponse>("/api/v1/billing/plans", { token }),
      apiFetch<SubscriptionResponse>("/api/v1/billing/subscription", { token }),
      apiFetch<InvoiceList>("/api/v1/billing/invoices?page=1&limit=10", { token }),
    ])
      .then(([planRes, subRes, invoiceRes]) => {
        setPlans(planRes.plans);
        setProviders(planRes.providers);
        setSubscription(subRes.subscription);
        setInvoices(invoiceRes);
        setPlanId((current) => current || planRes.plans[0]?.id || "");
        setProvider((current) => (planRes.providers.includes(current) ? current : planRes.providers[0] ?? current));
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to load billing.");
      })
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!confirming || !token) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void apiFetch<SubscriptionResponse>("/api/v1/billing/subscription", { token }).then((res) => {
        if (!cancelled) setSubscription(res.subscription);
      });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [confirming, token]);

  const selected = useMemo(() => plans.find((plan) => plan.id === planId) ?? plans[0], [plans, planId]);

  async function startCheckout() {
    if (!token || !selected || pending) return;
    setPending(true);
    try {
      const checkout = await apiFetch<CheckoutResponse>("/api/v1/billing/checkout", {
        token,
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ planId: selected.id, provider, billingInterval: interval }),
      });
      if (checkout.checkoutUrl) {
        window.location.assign(checkout.checkoutUrl);
        return;
      }
      router.push("/billing/success");
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to start checkout.");
      setPending(false);
    }
  }

  async function confirmCancel() {
    if (!token) return;
    setPending(true);
    try {
      const next = await apiFetch<BillingSubscription>("/api/v1/billing/subscription/cancel", {
        token,
        method: "POST",
        body: JSON.stringify({ immediately: false }),
      });
      setSubscription(next);
      setCancelOpen(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? crmErrorMessage(err.code, err.message) : "Unable to cancel.");
    } finally {
      setPending(false);
    }
  }

  if (loading && !subscription && !plans.length) {
    return (
      <main>
        <div className="card wide">
          <LoadingState label="Loading billing" />
        </div>
      </main>
    );
  }

  return (
    <main className="billing-page">
      <div className="card wide">
        <h1>Billing</h1>
        <p className="muted">Organization subscription. Provider checkout is the payment form; this page reads internal state only.</p>
        {error ? <ErrorState message={error} /> : null}
        {confirming ? (
          <div className="banner" role="status" aria-live="polite">
            We&apos;re confirming your subscription. This page updates when the provider webhook is processed. A browser redirect is not payment confirmation.
          </div>
        ) : null}

        {subscription ? (
          <section className="billing-grid" aria-labelledby="current-plan-heading">
            <div>
              <h2 id="current-plan-heading">Current plan</h2>
              <p className="plan-name">{subscription.plan?.name ?? "Subscription"}</p>
              <p>
                {formatMoney(subscription.amount, subscription.currency)} / {intervalLabel(subscription.billingInterval)}
              </p>
              <p>
                <span className={`badge billing-${subscription.status.toLowerCase()}`}>{SUBSCRIPTION_LABELS[subscription.status]}</span>
              </p>
              <p>{renewalCopy(subscription, timeZone)}</p>
              <dl className="billing-meta">
                <div>
                  <dt>Provider</dt>
                  <dd>{subscription.provider === "RAZORPAY" ? "Razorpay" : "Stripe"}</dd>
                </div>
                <div>
                  <dt>Current period</dt>
                  <dd>
                    {formatBillingDate(subscription.currentPeriodStart, timeZone)} – {formatBillingDate(subscription.currentPeriodEnd, timeZone)}
                  </dd>
                </div>
              </dl>
              {manage && subscription.status !== "CANCELED" && subscription.status !== "EXPIRED" ? (
                <button type="button" className="secondary" onClick={() => setCancelOpen(true)}>
                  Cancel subscription
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <EmptyState title="No active subscription" body="Choose a plan to start checkout. Access continues on the Free entitlement until a provider confirms payment." />
        )}
      </div>

      {manage && (!subscription || subscription.status === "CANCELED" || subscription.status === "EXPIRED" || subscription.status === "INCOMPLETE") ? (
        <div className="card wide">
          <h2>Choose a plan</h2>
          <div className="plan-grid">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                className={plan.id === selected?.id ? "plan-card selected" : "plan-card"}
                onClick={() => setPlanId(plan.id)}
                aria-pressed={plan.id === selected?.id}
              >
                <strong>{plan.name}</strong>
                <p>{formatMoney(interval === "YEAR" ? plan.yearlyPrice : plan.monthlyPrice, plan.currency)} / {intervalLabel(interval)}</p>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
          <fieldset className="filters">
            <legend className="sr-only">Checkout options</legend>
            <label>
              Billing interval
              <select value={interval} onChange={(event) => setInterval(event.target.value as BillingInterval)}>
                <option value="MONTH">Monthly</option>
                <option value="YEAR">Yearly</option>
              </select>
            </label>
            <label>
              Provider
              <select value={provider} onChange={(event) => setProvider(event.target.value as PaymentProvider)}>
                {(providers.length ? providers : ["STRIPE", "RAZORPAY"]).map((item) => (
                  <option key={item} value={item}>
                    {item === "RAZORPAY" ? "Razorpay" : "Stripe"}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={pending || !selected} onClick={() => void startCheckout()}>
              {pending ? "Starting checkout…" : "Start checkout"}
            </button>
          </fieldset>
          <p className="muted">Plan changes after checkout are coming soon.</p>
        </div>
      ) : null}

      <div className="card wide">
        <h2>Invoices</h2>
        <DataTable
          columns={[
            { key: "number", header: "Invoice", render: (row) => row.invoiceNumber ?? row.id.slice(0, 8) },
            { key: "date", header: "Date", render: (row) => formatBillingDate(row.createdAt, timeZone) },
            { key: "amount", header: "Amount", render: (row) => formatMoney(row.amount, row.currency) },
            { key: "status", header: "Status", render: (row) => INVOICE_LABELS[row.status] },
            { key: "provider", header: "Provider", render: (row) => row.provider },
            {
              key: "actions",
              header: "Actions",
              render: (row) =>
                row.invoiceUrl ? (
                  <a href={row.invoiceUrl} target="_blank" rel="noreferrer">
                    View
                  </a>
                ) : (
                  "—"
                ),
            },
          ]}
          rows={invoices?.items ?? []}
          loading={loading}
          emptyTitle="No invoices"
          emptyBody="Invoices appear after the provider confirms a payment."
        />
        <Pagination page={invoices?.pagination.page ?? 1} totalPages={invoices?.pagination.totalPages ?? 1} onPage={(next) => { setPage(next); void load(next); }} />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel subscription?"
        confirmLabel="Cancel at period end"
        pending={pending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => void confirmCancel()}
      >
        <p>
          {subscription?.plan?.name ?? "This plan"} stays available until {formatBillingDate(subscription?.currentPeriodEnd, timeZone)}.
          After that, the organization returns to the Free entitlement. This does not cancel immediately.
        </p>
      </ConfirmDialog>
    </main>
  );
}

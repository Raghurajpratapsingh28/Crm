import type { BillingInterval, PaymentProvider } from "@crm/types";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { env, isTest } from "../../config/env.js";
import { isUniqueConstraint, paginationMeta, parseDateBound, parsePagination, parseSortOrder, whitelistSort } from "../../lib/crm.js";
import { DEFAULT_BILLING_PLANS } from "../../lib/payments/catalog.js";
import { enabledProviders, getPaymentProvider, getWebhookVerifier } from "../../lib/payments/factory.js";
import { fromMinorUnits, normalizeCurrency } from "../../lib/payments/money.js";
import { BLOCKING_SUBSCRIPTION_STATUSES, OPEN_SUBSCRIPTION_STATUSES } from "../../lib/payments/provider.js";
import { redactPayload } from "../../lib/payments/redact.js";
import {
  iso,
  mapInternalEvent,
  type BillingSnapshot,
  type InvoiceSnapshot,
  type SubscriptionSnapshot,
} from "../../lib/payments/snapshot.js";
import { enqueue } from "../../lib/queue.js";
import { writeAudit } from "../../services/audit.service.js";
import { fail, invalid, notFound } from "../../utils/errors.js";
import { logger } from "../../utils/logger.js";
import { prisma } from "../../lib/prisma.js";
import { applyBillingSnapshot, applyPaymentEvent, applyProviderSubscription, toInvoiceDto, toPlanPublic, toSubscriptionDto } from "./billing.apply.js";

type Actor = { organizationId: string; userId: string };

const INVOICE_SORT: Record<string, "createdAt" | "amount" | "status"> = {
  createdAt: "createdAt",
  created_at: "createdAt",
  amount: "amount",
  status: "status",
};

const INVOICE_STATUSES = new Set(["DRAFT", "OPEN", "PAID", "VOID", "UNCOLLECTIBLE", "FAILED"]);

export async function ensureDefaultPlans() {
  for (const plan of DEFAULT_BILLING_PLANS) {
    await prisma.billingPlan.upsert({
      where: { key: plan.key },
      update: {
        name: plan.name,
        description: plan.description,
        active: true,
        currency: plan.currency,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        stripePriceIdMonth: plan.stripePriceIdMonth,
        stripePriceIdYear: plan.stripePriceIdYear,
        razorpayPlanIdMonth: plan.razorpayPlanIdMonth,
        razorpayPlanIdYear: plan.razorpayPlanIdYear,
        features: plan.features,
        entitlement: plan.entitlement,
      },
      create: plan,
    });
  }
}

export async function listPublicPlans() {
  if ((await prisma.billingPlan.count()) === 0) await ensureDefaultPlans();
  const plans = await prisma.billingPlan.findMany({ where: { active: true }, orderBy: { monthlyPrice: "asc" } });
  return { plans: plans.map(toPlanPublic), providers: enabledProviders() };
}

export async function getCurrentSubscription(organizationId: string) {
  const row = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: OPEN_SUBSCRIPTION_STATUSES } },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  }) ?? await prisma.subscription.findFirst({
    where: { organizationId },
    include: { plan: true },
    orderBy: { createdAt: "desc" },
  });
  return { subscription: row ? toSubscriptionDto(row) : null };
}

export async function listInvoices(organizationId: string, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const status = String(query.status ?? "").trim().toUpperCase();
  const from = parseDateBound(query.from ?? query.dateFrom, "from");
  const to = parseDateBound(query.to ?? query.dateTo, "to");
  const order = parseSortOrder(query.sort);
  const sortBy = whitelistSort(query.sortBy, INVOICE_SORT, "createdAt");
  const where: Prisma.InvoiceWhereInput = {
    organizationId,
    ...(status && INVOICE_STATUSES.has(status) ? { status: status as never } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };
  const [total, items] = await prisma.$transaction([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({ where, orderBy: { [sortBy]: order }, skip, take: limit }),
  ]);
  return { items: items.map(toInvoiceDto), pagination: paginationMeta(page, limit, total) };
}

export async function getInvoice(organizationId: string, id: string) {
  const row = await prisma.invoice.findFirst({ where: { id, organizationId } });
  if (!row) throw notFound();
  return toInvoiceDto(row);
}

function priceIdFor(plan: {
  stripePriceIdMonth: string | null;
  stripePriceIdYear: string | null;
  razorpayPlanIdMonth: string | null;
  razorpayPlanIdYear: string | null;
}, provider: PaymentProvider, interval: BillingInterval) {
  if (provider === "STRIPE") return interval === "YEAR" ? plan.stripePriceIdYear : plan.stripePriceIdMonth;
  return interval === "YEAR" ? plan.razorpayPlanIdYear : plan.razorpayPlanIdMonth;
}

async function findPlan(planId: string) {
  return prisma.billingPlan.findFirst({
    where: { OR: [{ id: planId }, { key: planId }] },
  });
}

export async function createCheckout(
  actor: Actor,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const planId = String(body.planId ?? "").trim();
  const provider = String(body.provider ?? "").trim().toUpperCase() as PaymentProvider;
  const billingInterval = String(body.billingInterval ?? "").trim().toUpperCase() as BillingInterval;
  if (provider !== "STRIPE" && provider !== "RAZORPAY") {
    throw fail(400, "PROVIDER_NOT_SUPPORTED", "provider must be STRIPE or RAZORPAY");
  }
  if (billingInterval !== "MONTH" && billingInterval !== "YEAR") {
    throw invalid("billingInterval must be MONTH or YEAR");
  }
  if (!planId) throw fail(400, "PLAN_NOT_FOUND", "planId is required");
  if (!enabledProviders().includes(provider)) {
    throw fail(503, "BILLING_NOT_CONFIGURED", `${provider} is not configured`);
  }

  await ensureDefaultPlans();
  const plan = await findPlan(planId);
  if (!plan) throw fail(404, "PLAN_NOT_FOUND", "Plan was not found");
  if (!plan.active) throw fail(400, "PLAN_INACTIVE", "Plan is not active");

  const priceId = priceIdFor(plan, provider, billingInterval);
  if (!priceId) throw fail(503, "BILLING_NOT_CONFIGURED", "Plan is missing a provider price id");

  const blocking = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId, status: { in: BLOCKING_SUBSCRIPTION_STATUSES } },
  });
  if (blocking) {
    throw fail(409, "SUBSCRIPTION_ALREADY_ACTIVE", "This organization already has an active subscription");
  }

  const key = (idempotencyKey ?? "").trim().slice(0, 200);
  if (key) {
    const prior = await prisma.billingCheckout.findUnique({
      where: { organizationId_idempotencyKey: { organizationId: actor.organizationId, idempotencyKey: key } },
    });
    if (prior) {
      if (prior.planId !== plan.id || prior.provider !== provider || prior.billingInterval !== billingInterval) {
        throw invalid("Idempotency-Key was reused with different checkout parameters");
      }
      return prior.response as { provider: PaymentProvider; checkoutType: string };
    }
  }

  const org = await prisma.organization.findUniqueOrThrow({ where: { id: actor.organizationId } });
  const actorUser = await prisma.user.findUnique({ where: { id: actor.userId } });
  const adapter = getPaymentProvider(provider);

  const existingCustomer = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId, provider, providerCustomerId: { not: "" } },
    orderBy: { createdAt: "desc" },
  });

  let customerId = existingCustomer?.providerCustomerId;
  if (!customerId) {
    const customer = await adapter.createCustomer({
      organizationId: actor.organizationId,
      name: org.name,
      email: actorUser?.email,
    });
    customerId = customer.id;
  }

  const incomplete = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId, status: "INCOMPLETE" },
  });

  const successUrl = `${env.webUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${env.webUrl}/billing?checkout=canceled`;

  let checkout;
  try {
    checkout = await adapter.createCheckout({
      organizationId: actor.organizationId,
      customerId,
      priceId,
      interval: billingInterval,
      successUrl,
      cancelUrl,
      idempotencyKey: key || undefined,
    });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    logger.warn({ billingProvider: provider, err: error instanceof Error ? error.message : "checkout" }, "checkout failed");
    throw fail(502, "CHECKOUT_CREATION_FAILED", "Unable to start checkout");
  }

  const amount = billingInterval === "YEAR" ? plan.yearlyPrice : plan.monthlyPrice;
  const subscription = incomplete
    ? await prisma.subscription.update({
      where: { id: incomplete.id },
      data: {
        provider,
        providerCustomerId: customerId,
        providerSubscriptionId: checkout.subscriptionId ?? incomplete.providerSubscriptionId,
        planId: plan.id,
        status: "INCOMPLETE",
        currency: plan.currency,
        amount,
        billingInterval,
      },
    })
    : await prisma.subscription.create({
      data: {
        organizationId: actor.organizationId,
        provider,
        providerCustomerId: customerId,
        providerSubscriptionId: checkout.subscriptionId,
        planId: plan.id,
        status: "INCOMPLETE",
        currency: plan.currency,
        amount,
        billingInterval,
      },
    });

  const response = {
    provider,
    checkoutType: checkout.checkoutType,
    checkoutUrl: checkout.checkoutUrl,
    sessionId: checkout.sessionId,
    subscriptionId: subscription.id,
    publishableKey: checkout.publishableKey,
  };

  await prisma.$transaction(async (tx) => {
    if (key) {
      await tx.billingCheckout.create({
        data: {
          organizationId: actor.organizationId,
          idempotencyKey: key,
          provider,
          planId: plan.id,
          billingInterval,
          status: "CREATED",
          checkoutUrl: checkout.checkoutUrl,
          sessionId: checkout.sessionId,
          response: response as unknown as Prisma.InputJsonValue,
        },
      });
    }
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "BILLING_CHECKOUT_CREATED",
      entityType: "subscription",
      entityId: subscription.id,
      metadata: { provider, plan: plan.key, billingInterval },
    });
  });

  logger.info({
    billingProvider: provider,
    organizationId: actor.organizationId,
    subscriptionId: subscription.id,
  }, "checkout created");
  return response;
}

export async function cancelSubscription(actor: Actor, immediately = false) {
  const row = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId, status: { in: OPEN_SUBSCRIPTION_STATUSES } },
    include: { plan: true },
  });
  if (!row?.providerSubscriptionId) throw fail(404, "SUBSCRIPTION_NOT_FOUND", "No subscription to cancel");
  if (row.status === "CANCELED") {
    return toSubscriptionDto(row);
  }

  const adapter = getPaymentProvider(row.provider);
  let snapshot;
  try {
    snapshot = await adapter.cancelSubscription(row.providerSubscriptionId, { immediately });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    logger.warn({ billingProvider: row.provider, subscriptionId: row.id }, "cancel failed");
    throw fail(502, "PAYMENT_PROVIDER_ERROR", "Unable to cancel subscription");
  }

  await applyProviderSubscription({
    subscriptionId: row.id,
    snapshot: toSubscriptionSnapshot(row.provider, snapshot),
  });
  const updated = await prisma.subscription.findUniqueOrThrow({ where: { id: row.id }, include: { plan: true } });
  await writeAudit(prisma, {
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: "SUBSCRIPTION_CANCELED",
    entityType: "subscription",
    entityId: updated.id,
    metadata: { immediately, cancelAtPeriodEnd: updated.cancelAtPeriodEnd, status: updated.status },
  });
  return toSubscriptionDto(updated);
}

export async function reactivateSubscription(actor: Actor) {
  const row = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId, status: { in: OPEN_SUBSCRIPTION_STATUSES }, cancelAtPeriodEnd: true },
    include: { plan: true },
  });
  if (!row?.providerSubscriptionId) throw fail(404, "SUBSCRIPTION_NOT_FOUND", "No scheduled cancellation to reverse");
  const adapter = getPaymentProvider(row.provider);
  if (!adapter.reactivateSubscription) {
    throw fail(400, "CANNOT_REACTIVATE_SUBSCRIPTION", "This provider cannot reverse a scheduled cancellation");
  }
  const snapshot = await adapter.reactivateSubscription(row.providerSubscriptionId);
  await applyProviderSubscription({
    subscriptionId: row.id,
    snapshot: toSubscriptionSnapshot(row.provider, snapshot),
  });
  const updated = await prisma.subscription.findUniqueOrThrow({ where: { id: row.id }, include: { plan: true } });
  await writeAudit(prisma, {
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: "SUBSCRIPTION_REACTIVATED",
    entityType: "subscription",
    entityId: updated.id,
    metadata: { status: updated.status },
  });
  return toSubscriptionDto(updated);
}

export async function enqueueReconcile(actor: Actor) {
  const row = await prisma.subscription.findFirst({
    where: { organizationId: actor.organizationId, status: { in: OPEN_SUBSCRIPTION_STATUSES } },
  });
  if (!row) throw fail(404, "SUBSCRIPTION_NOT_FOUND", "No subscription to reconcile");
  await enqueue("payments.subscription", { subscriptionId: row.id }, { organizationId: actor.organizationId });
  return { queued: true, subscriptionId: row.id };
}

function toSubscriptionSnapshot(
  provider: PaymentProvider,
  row: {
    id: string;
    customerId: string;
    status: SubscriptionSnapshot["status"];
    currency: string;
    amountMinor?: number;
    interval: BillingInterval;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    cancelAtPeriodEnd: boolean;
    canceledAt?: Date | null;
    trialStart?: Date | null;
    trialEnd?: Date | null;
    priceId?: string;
  },
): SubscriptionSnapshot {
  return {
    provider,
    externalId: row.id,
    customerId: row.customerId,
    status: row.status,
    currency: normalizeCurrency(row.currency),
    amount: row.amountMinor != null ? fromMinorUnits(row.amountMinor, row.currency) : null,
    interval: row.interval,
    currentPeriodStart: iso(row.currentPeriodStart),
    currentPeriodEnd: iso(row.currentPeriodEnd),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: iso(row.canceledAt),
    trialStart: iso(row.trialStart),
    trialEnd: iso(row.trialEnd),
    priceId: row.priceId,
  };
}

function entityRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readId(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
      return (value as { id: string }).id;
    }
  }
  return "";
}

function unixIso(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function mapStatusFromPayload(provider: PaymentProvider, eventType: string, status?: string) {
  if (provider === "STRIPE") {
    const table: Record<string, SubscriptionSnapshot["status"]> = {
      incomplete: "INCOMPLETE",
      incomplete_expired: "EXPIRED",
      trialing: "TRIALING",
      active: "ACTIVE",
      past_due: "PAST_DUE",
      canceled: "CANCELED",
      unpaid: "UNPAID",
      paused: "PAUSED",
    };
    if (status && table[status]) return table[status];
  } else {
    const table: Record<string, SubscriptionSnapshot["status"]> = {
      created: "INCOMPLETE",
      authenticated: "INCOMPLETE",
      active: "ACTIVE",
      pending: "PAST_DUE",
      halted: "PAUSED",
      cancelled: "CANCELED",
      completed: "EXPIRED",
      expired: "EXPIRED",
    };
    if (status && table[status]) return table[status];
  }
  if (eventType.includes("cancel") || eventType.includes("deleted")) return "CANCELED";
  if (eventType.includes("paid") || eventType.includes("activated") || eventType.includes("charged")) return "ACTIVE";
  if (eventType.includes("fail") || eventType.includes("pending")) return "PAST_DUE";
  return "INCOMPLETE";
}

function extractSubscription(provider: PaymentProvider, eventType: string, record: Record<string, unknown>): SubscriptionSnapshot | undefined {
  const looksLikeSub = eventType.includes("subscription") || eventType.startsWith("checkout.session") || String(record.object ?? "") === "subscription";
  const id = readId(
    eventType.startsWith("checkout.session") ? record.subscription : undefined,
    record.subscription_id,
    looksLikeSub && !eventType.includes("invoice") ? record.id : undefined,
  );
  if (!id) return undefined;
  const item = Array.isArray((record.items as { data?: unknown[] } | undefined)?.data)
    ? entityRecord((record.items as { data: unknown[] }).data[0])
    : {};
  const price = entityRecord(item.price);
  const currency = String(price.currency ?? record.currency ?? (provider === "RAZORPAY" ? "INR" : "USD"));
  const amountMinor = typeof price.unit_amount === "number"
    ? price.unit_amount
    : typeof record.amount === "number"
      ? record.amount
      : undefined;
  return {
    provider,
    externalId: id,
    customerId: readId(record.customer, record.customer_id),
    status: mapStatusFromPayload(provider, eventType, typeof record.status === "string" ? record.status : undefined),
    currency: currency.toUpperCase(),
    amount: amountMinor != null ? fromMinorUnits(amountMinor, currency) : null,
    interval: String((entityRecord(price.recurring).interval ?? record.interval) ?? "") === "year" ? "YEAR" : "MONTH",
    currentPeriodStart: unixIso(record.current_period_start ?? record.current_start),
    currentPeriodEnd: unixIso(record.current_period_end ?? record.current_end ?? record.charge_at),
    cancelAtPeriodEnd: Boolean(record.cancel_at_period_end),
    canceledAt: unixIso(record.canceled_at ?? record.ended_at),
    trialStart: unixIso(record.trial_start),
    trialEnd: unixIso(record.trial_end),
    priceId: typeof price.id === "string" ? price.id : typeof record.plan_id === "string" ? record.plan_id : undefined,
  };
}

function extractInvoice(provider: PaymentProvider, eventType: string, record: Record<string, unknown>): InvoiceSnapshot | undefined {
  const looksLikeInvoice = eventType.includes("invoice") || eventType.includes("payment") || String(record.object ?? "") === "invoice";
  const id = readId(looksLikeInvoice ? record.id : undefined, record.invoice, record.invoice_id);
  if (!id) return undefined;
  const currency = String(record.currency ?? (provider === "RAZORPAY" ? "INR" : "USD"));
  const amountMinor = typeof record.amount_paid === "number"
    ? record.amount_paid
    : typeof record.total === "number"
      ? record.total
      : typeof record.amount === "number"
        ? record.amount
        : 0;
  const statusRaw = String(record.status ?? "");
  const invoiceStatus = eventType.includes("fail")
    ? "FAILED"
    : statusRaw === "paid"
      ? "PAID"
      : statusRaw === "draft"
        ? "DRAFT"
        : statusRaw === "void" || statusRaw === "cancelled" || statusRaw === "expired"
          ? "VOID"
          : statusRaw === "uncollectible"
            ? "UNCOLLECTIBLE"
            : "OPEN";
  return {
    provider,
    externalId: id,
    subscriptionExternalId: readId(record.subscription, record.subscription_id) || undefined,
    customerId: readId(record.customer, record.customer_id) || undefined,
    status: invoiceStatus,
    currency: currency.toUpperCase(),
    amount: fromMinorUnits(amountMinor, currency),
    invoiceUrl: typeof record.hosted_invoice_url === "string" ? record.hosted_invoice_url : typeof record.short_url === "string" ? record.short_url : null,
    pdfUrl: typeof record.invoice_pdf === "string" ? record.invoice_pdf : null,
    number: typeof record.number === "string" ? record.number : typeof record.invoice_number === "string" ? record.invoice_number : null,
    periodStart: unixIso(record.period_start ?? record.billing_start),
    periodEnd: unixIso(record.period_end ?? record.billing_end),
    dueAt: unixIso(record.due_date),
    paidAt: unixIso(record.status_transitions && typeof record.status_transitions === "object"
      ? (record.status_transitions as { paid_at?: number }).paid_at
      : record.paid_at),
  };
}

async function snapshotFromVerified(
  provider: PaymentProvider,
  eventType: string,
  data: unknown,
): Promise<BillingSnapshot | undefined> {
  const internalType = mapInternalEvent(provider, eventType);
  if (internalType === "UNSUPPORTED") return undefined;
  const record = entityRecord(data);
  const subscription = extractSubscription(provider, eventType, record)
    ?? (readId(record.subscription, record.subscription_id)
      ? {
          provider,
          externalId: readId(record.subscription, record.subscription_id),
          customerId: readId(record.customer, record.customer_id),
          status: mapStatusFromPayload(provider, eventType, typeof record.status === "string" && eventType.includes("subscription") ? record.status : undefined),
          currency: String(record.currency ?? (provider === "RAZORPAY" ? "INR" : "USD")).toUpperCase(),
          amount: null,
          cancelAtPeriodEnd: false,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          canceledAt: null,
          trialStart: null,
          trialEnd: null,
        } satisfies SubscriptionSnapshot
      : undefined);
  const invoice = extractInvoice(provider, eventType, record);
  const sessionId = eventType.startsWith("checkout.session") ? readId(record.id) : undefined;

  let organizationId: string | undefined;
  if (subscription?.externalId) {
    organizationId = (await prisma.subscription.findFirst({
      where: { provider, providerSubscriptionId: subscription.externalId },
    }))?.organizationId;
  }
  if (!organizationId && subscription?.customerId) {
    organizationId = (await prisma.subscription.findFirst({
      where: { provider, providerCustomerId: subscription.customerId },
    }))?.organizationId;
  }
  if (!organizationId && invoice?.subscriptionExternalId) {
    organizationId = (await prisma.subscription.findFirst({
      where: { provider, providerSubscriptionId: invoice.subscriptionExternalId },
    }))?.organizationId;
  }
  if (!organizationId && invoice?.customerId) {
    organizationId = (await prisma.subscription.findFirst({
      where: { provider, providerCustomerId: invoice.customerId },
    }))?.organizationId;
  }
  if (!organizationId && sessionId) {
    organizationId = (await prisma.billingCheckout.findFirst({
      where: { sessionId, provider },
    }))?.organizationId;
  }

  return {
    version: 1,
    internalType,
    organizationId,
    checkoutSessionId: sessionId,
    subscription,
    invoice,
  };
}

export async function ingestWebhook(input: {
  provider: PaymentProvider;
  raw: Buffer;
  signature: string;
  headers: Record<string, string>;
}) {
  const verifier = getWebhookVerifier(input.provider);
  let verified;
  try {
    verified = await verifier.verifyWebhook(input.raw, input.signature, input.headers);
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) throw error;
    throw fail(400, "INVALID_WEBHOOK", "Webhook signature is invalid");
  }

  const headerEventId = input.headers["x-razorpay-event-id"] ?? input.headers["X-Razorpay-Event-Id"];
  const eventId = String(headerEventId || verified.id || "").trim();
  if (!eventId) throw fail(400, "INVALID_WEBHOOK", "Webhook event id is missing");

  const existing = await prisma.paymentEvent.findUnique({
    where: { provider_providerEventId: { provider: input.provider, providerEventId: eventId } },
  });
  if (existing) {
    if (existing.status === "FAILED" || existing.status === "RECEIVED") {
      await enqueue("payments.event", { paymentEventId: existing.id }, { organizationId: existing.organizationId ?? undefined });
      if (isTest) await applyPaymentEvent(existing.id);
    }
    return { received: true, duplicate: true, paymentEventId: existing.id };
  }

  const internalType = mapInternalEvent(input.provider, verified.type);
  const unwrapped = (() => {
    const rec = entityRecord(verified.data);
    if (rec.object && typeof rec.object === "object" && !Array.isArray(rec.object)) return rec.object;
    return verified.data;
  })();
  const snapshot = internalType === "UNSUPPORTED"
    ? undefined
    : await snapshotFromVerified(input.provider, verified.type, unwrapped).catch((error) => {
      logger.warn({ billingProvider: input.provider, eventType: verified.type, err: error instanceof Error ? error.message : "normalize" }, "normalize failed");
      return undefined;
    });

  const payloadHash = createHash("sha256").update(input.raw).digest("hex");
  const payload = {
    internalType,
    snapshot,
    raw: redactPayload(verified.raw),
  };

  try {
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.paymentEvent.create({
        data: {
          provider: input.provider,
          providerEventId: eventId,
          eventType: verified.type,
          payload: payload as Prisma.InputJsonValue,
          payloadHash,
          status: internalType === "UNSUPPORTED" ? "IGNORED" : "RECEIVED",
          processedAt: internalType === "UNSUPPORTED" ? new Date() : null,
          organizationId: snapshot?.organizationId,
        },
      });
      if (internalType !== "UNSUPPORTED") {
        await enqueue("payments.event", { paymentEventId: event.id }, {
          organizationId: snapshot?.organizationId,
          client: tx,
        });
        if (internalType === "INVOICE_FAILED" || internalType === "PAYMENT_FAILED") {
          await enqueue("payments.dunning", { paymentEventId: event.id }, {
            organizationId: snapshot?.organizationId,
            client: tx,
          });
        }
      }
      return event;
    });

    logger.info({
      billingProvider: input.provider,
      paymentEventId: created.id,
      eventType: verified.type,
    }, "webhook recorded");

    if (isTest && created.status === "RECEIVED") {
      await applyPaymentEvent(created.id);
    }
    return { received: true, duplicate: false, paymentEventId: created.id };
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return { received: true, duplicate: true };
    }
    throw error;
  }
}

export async function reconcileSubscriptionById(subscriptionId: string) {
  const row = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!row?.providerSubscriptionId) return { skipped: true };
  const adapter = getPaymentProvider(row.provider);
  const remote = await adapter.getSubscription(row.providerSubscriptionId);
  if (!remote.id || remote.id !== row.providerSubscriptionId) {
    logger.error({ subscriptionId, billingProvider: row.provider }, "reconcile rejected provider id mismatch");
    return { skipped: true };
  }
  await applyProviderSubscription({
    subscriptionId: row.id,
    snapshot: toSubscriptionSnapshot(row.provider, remote),
  });
  return { skipped: false };
}

export async function reconcileInvoiceById(invoiceId: string) {
  const row = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!row) return { skipped: true };
  const adapter = getPaymentProvider(row.provider);
  const remote = await adapter.getInvoice(row.providerInvoiceId);
  const snapshot: InvoiceSnapshot = {
    provider: row.provider,
    externalId: remote.id,
    subscriptionExternalId: remote.subscriptionId ?? undefined,
    customerId: remote.customerId,
    status: remote.status,
    currency: remote.currency,
    amount: fromMinorUnits(remote.amountMinor, remote.currency),
    invoiceUrl: remote.invoiceUrl,
    pdfUrl: remote.pdfUrl,
    number: remote.number,
    periodStart: iso(remote.periodStart),
    periodEnd: iso(remote.periodEnd),
    dueAt: iso(remote.dueAt),
    paidAt: iso(remote.paidAt),
  };
  await applyBillingSnapshot({ version: 1, internalType: "INVOICE_CREATED", organizationId: row.organizationId, invoice: snapshot });
  return { skipped: false };
}

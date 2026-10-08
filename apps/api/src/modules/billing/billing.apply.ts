import type { AuditAction, InvoiceStatus, NotificationType, Prisma, SubscriptionStatus } from "@prisma/client";
import type { BillingInvoice, BillingPlanPublic, BillingSubscription } from "@crm/types";
import { prisma } from "../../lib/prisma.js";
import { decimalString, normalizeCurrency } from "../../lib/payments/money.js";
import { BLOCKING_SUBSCRIPTION_STATUSES, OPEN_SUBSCRIPTION_STATUSES } from "../../lib/payments/provider.js";
import {
  parseIso,
  type BillingSnapshot,
  type InvoiceSnapshot,
  type StoredPaymentPayload,
  type SubscriptionSnapshot,
} from "../../lib/payments/snapshot.js";
import { enqueue } from "../../lib/queue.js";
import { writeAudit } from "../../services/audit.service.js";
import { enqueueNotification } from "../../services/notification.service.js";
import { logger } from "../../utils/logger.js";

const OPEN = OPEN_SUBSCRIPTION_STATUSES;
const BLOCKING = BLOCKING_SUBSCRIPTION_STATUSES;

export function toPlanPublic(plan: {
  id: string;
  key: string;
  name: string;
  description: string | null;
  currency: string;
  monthlyPrice: Prisma.Decimal | string | number;
  yearlyPrice: Prisma.Decimal | string | number;
  features: string[];
}): BillingPlanPublic {
  return {
    id: plan.id,
    key: plan.key,
    name: plan.name,
    description: plan.description,
    currency: plan.currency,
    monthlyPrice: decimalString(plan.monthlyPrice),
    yearlyPrice: decimalString(plan.yearlyPrice),
    features: plan.features,
  };
}

export function toSubscriptionDto(row: {
  id: string;
  organizationId: string;
  provider: BillingSubscription["provider"];
  status: BillingSubscription["status"];
  currency: string;
  amount: Prisma.Decimal | string | number | null;
  billingInterval: BillingSubscription["billingInterval"];
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  trialStart: Date | null;
  trialEnd: Date | null;
  plan: Parameters<typeof toPlanPublic>[0] | null;
}): BillingSubscription {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: row.provider,
    status: row.status,
    plan: row.plan ? toPlanPublic(row.plan) : null,
    currency: row.currency,
    amount: row.amount == null ? null : decimalString(row.amount),
    billingInterval: row.billingInterval,
    currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
    renewsAt: row.cancelAtPeriodEnd ? null : row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    trialStart: row.trialStart?.toISOString() ?? null,
    trialEnd: row.trialEnd?.toISOString() ?? null,
  };
}

export function toInvoiceDto(row: {
  id: string;
  organizationId: string;
  subscriptionId: string | null;
  provider: BillingInvoice["provider"];
  invoiceNumber: string | null;
  status: BillingInvoice["status"];
  currency: string;
  amount: Prisma.Decimal | string | number;
  invoiceUrl: string | null;
  pdfUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
}): BillingInvoice {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subscriptionId: row.subscriptionId,
    provider: row.provider,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    currency: row.currency,
    amount: decimalString(row.amount),
    invoiceUrl: row.invoiceUrl,
    pdfUrl: row.pdfUrl,
    periodStart: row.periodStart?.toISOString() ?? null,
    periodEnd: row.periodEnd?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function validCurrency(value?: string | null) {
  try {
    return normalizeCurrency(value);
  } catch {
    return null;
  }
}

async function resolvePlanId(priceId?: string, planKey?: string) {
  if (planKey) {
    const byKey = await prisma.billingPlan.findUnique({ where: { key: planKey } });
    if (byKey) return byKey;
  }
  if (!priceId) return null;
  return prisma.billingPlan.findFirst({
    where: {
      OR: [
        { stripePriceIdMonth: priceId },
        { stripePriceIdYear: priceId },
        { razorpayPlanIdMonth: priceId },
        { razorpayPlanIdYear: priceId },
      ],
    },
  });
}

async function locateSubscription(snapshot: SubscriptionSnapshot, organizationId?: string) {
  const byExternal = await prisma.subscription.findFirst({
    where: { provider: snapshot.provider, providerSubscriptionId: snapshot.externalId },
  });
  if (byExternal) return byExternal;
  if (snapshot.customerId) {
    const byCustomer = await prisma.subscription.findFirst({
      where: { provider: snapshot.provider, providerCustomerId: snapshot.customerId, status: { in: OPEN } },
      orderBy: { createdAt: "desc" },
    });
    if (byCustomer) return byCustomer;
  }
  if (organizationId) {
    return prisma.subscription.findFirst({
      where: { organizationId, provider: snapshot.provider, status: { in: OPEN } },
      orderBy: { createdAt: "desc" },
    });
  }
  return null;
}

async function applySubscription(snapshot: SubscriptionSnapshot, hintedOrgId?: string) {
  const currency = validCurrency(snapshot.currency);
  if (!currency || !snapshot.externalId || !snapshot.customerId) {
    logger.warn({ billingProvider: snapshot.provider, externalSubscriptionId: snapshot.externalId }, "skip malformed subscription snapshot");
    return null;
  }
  const existing = await locateSubscription(snapshot, hintedOrgId);
  const organizationId = existing?.organizationId ?? hintedOrgId;
  if (!organizationId) {
    logger.warn({ billingProvider: snapshot.provider, externalSubscriptionId: snapshot.externalId }, "subscription snapshot has no organization");
    return null;
  }
  if (existing && existing.organizationId !== organizationId) {
    logger.error({
      billingProvider: snapshot.provider,
      subscriptionId: existing.id,
      organizationId,
    }, "refusing to reassign subscription across organizations");
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: existing.id }, include: { plan: true } });
    return { row, previous: existing.status };
  }

  const open = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: BLOCKING } },
  });
  if (open && open.id !== existing?.id && open.providerSubscriptionId !== snapshot.externalId) {
    logger.error({
      billingProvider: snapshot.provider,
      organizationId,
      externalSubscriptionId: snapshot.externalId,
      existingSubscriptionId: open.id,
    }, "refusing second open subscription");
    const row = await prisma.subscription.findUniqueOrThrow({ where: { id: open.id }, include: { plan: true } });
    return { row, previous: open.status };
  }

  const plan = await resolvePlanId(snapshot.priceId, snapshot.planKey);
  const data = {
    organizationId,
    provider: snapshot.provider,
    providerCustomerId: snapshot.customerId,
    providerSubscriptionId: snapshot.externalId,
    status: snapshot.status,
    currency,
    amount: snapshot.amount,
    billingInterval: snapshot.interval ?? existing?.billingInterval ?? "MONTH",
    currentPeriodStart: parseIso(snapshot.currentPeriodStart),
    currentPeriodEnd: parseIso(snapshot.currentPeriodEnd),
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    canceledAt: parseIso(snapshot.canceledAt),
    trialStart: parseIso(snapshot.trialStart),
    trialEnd: parseIso(snapshot.trialEnd),
    planId: plan?.id ?? existing?.planId ?? null,
  };

  const previous = existing?.status;
  const row = existing
    ? await prisma.subscription.update({ where: { id: existing.id }, data, include: { plan: true } })
    : await prisma.subscription.create({ data, include: { plan: true } });

  if (plan && (row.status === "ACTIVE" || row.status === "TRIALING")) {
    await prisma.organization.update({ where: { id: organizationId }, data: { plan: plan.entitlement } });
  }
  if (row.status === "CANCELED" || row.status === "EXPIRED") {
    await prisma.organization.update({ where: { id: organizationId }, data: { plan: "FREE" } });
  }

  return { row, previous };
}

async function applyInvoice(snapshot: InvoiceSnapshot, organizationId?: string, subscriptionId?: string) {
  const currency = validCurrency(snapshot.currency);
  if (!currency || !snapshot.externalId) {
    logger.warn({ billingProvider: snapshot.provider, externalInvoiceId: snapshot.externalId }, "skip malformed invoice snapshot");
    return null;
  }
  const existing = await prisma.invoice.findUnique({
    where: { provider_providerInvoiceId: { provider: snapshot.provider, providerInvoiceId: snapshot.externalId } },
  });
  let orgId = existing?.organizationId ?? organizationId;
  let subId = existing?.subscriptionId ?? subscriptionId ?? null;
  if (!orgId && snapshot.subscriptionExternalId) {
    const sub = await prisma.subscription.findFirst({
      where: { provider: snapshot.provider, providerSubscriptionId: snapshot.subscriptionExternalId },
    });
    orgId = sub?.organizationId;
    subId = sub?.id ?? subId;
  }
  if (!orgId) return null;
  const data = {
    organizationId: orgId,
    subscriptionId: subId,
    provider: snapshot.provider,
    providerInvoiceId: snapshot.externalId,
    invoiceNumber: snapshot.number ?? existing?.invoiceNumber ?? null,
    amount: snapshot.amount,
    currency,
    status: snapshot.status,
    invoiceUrl: snapshot.invoiceUrl ?? existing?.invoiceUrl ?? null,
    pdfUrl: snapshot.pdfUrl ?? existing?.pdfUrl ?? null,
    periodStart: parseIso(snapshot.periodStart),
    periodEnd: parseIso(snapshot.periodEnd),
    dueAt: parseIso(snapshot.dueAt),
    paidAt: parseIso(snapshot.paidAt),
  };
  return existing
    ? prisma.invoice.update({ where: { id: existing.id }, data })
    : prisma.invoice.create({ data });
}

function auditFor(internalType: string, previous?: SubscriptionStatus, next?: SubscriptionStatus): AuditAction {
  if (internalType === "SUBSCRIPTION_CREATED") return "SUBSCRIPTION_CREATED";
  if (internalType === "SUBSCRIPTION_CANCELED") return "SUBSCRIPTION_CANCELED";
  if (internalType === "INVOICE_PAID") return "INVOICE_PAID";
  if (internalType === "INVOICE_FAILED" || internalType === "PAYMENT_FAILED") return "INVOICE_FAILED";
  if (internalType === "SUBSCRIPTION_RENEWED") return "PAYMENT_SUCCEEDED";
  if (previous && next && previous !== next) return "SUBSCRIPTION_UPDATED";
  return "SUBSCRIPTION_UPDATED";
}

function notificationFor(internalType: string, status?: SubscriptionStatus): NotificationType | null {
  if (internalType === "SUBSCRIPTION_CREATED" && (status === "ACTIVE" || status === "TRIALING")) return "SUBSCRIPTION_ACTIVATED";
  if (internalType === "SUBSCRIPTION_RENEWED") return "SUBSCRIPTION_RENEWED";
  if (internalType === "SUBSCRIPTION_CANCELED") return "SUBSCRIPTION_CANCELED";
  if (internalType === "INVOICE_PAID") return "PAYMENT_RECEIVED";
  if (internalType === "INVOICE_FAILED" || internalType === "PAYMENT_FAILED") return "PAYMENT_FAILED";
  if (internalType === "INVOICE_CREATED") return "INVOICE_AVAILABLE";
  if (status === "PAST_DUE") return "SUBSCRIPTION_PAST_DUE";
  return null;
}

async function notifyAdmins(input: {
  organizationId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  dedupeKey: string;
}) {
  const admins = await prisma.organizationMember.findMany({
    where: { organizationId: input.organizationId, role: "ADMIN", status: "ACTIVE" },
    select: { userId: true },
  });
  await prisma.$transaction(async (tx) => {
    for (const admin of admins) {
      await enqueueNotification(tx, {
        organizationId: input.organizationId,
        userId: admin.userId,
        type: input.type,
        payload: input.payload,
        dedupeKey: `${input.dedupeKey}:${admin.userId}`,
      });
    }
    if (input.type === "PAYMENT_FAILED" || input.type === "SUBSCRIPTION_PAST_DUE") {
      await enqueue("email.receipt", { kind: input.type, organizationId: input.organizationId, ...input.payload }, {
        organizationId: input.organizationId,
        client: tx,
      });
    }
  });
}

export async function applyBillingSnapshot(snapshot: BillingSnapshot, eventId?: string) {
  const appliedSub = snapshot.subscription
    ? await applySubscription(snapshot.subscription, snapshot.organizationId)
    : null;
  const subscription = appliedSub?.row ?? null;
  const previous = appliedSub?.previous;
  const invoice = snapshot.invoice
    ? await applyInvoice(snapshot.invoice, snapshot.organizationId ?? subscription?.organizationId, subscription?.id)
    : null;

  const organizationId = subscription?.organizationId ?? invoice?.organizationId ?? snapshot.organizationId;
  if (organizationId) {
    const action = auditFor(snapshot.internalType, previous, subscription?.status);
    await writeAudit(prisma, {
      organizationId,
      action,
      entityType: invoice ? "invoice" : "subscription",
      entityId: invoice?.id ?? subscription?.id ?? organizationId,
      metadata: {
        provider: snapshot.subscription?.provider ?? snapshot.invoice?.provider,
        plan: subscription?.plan?.key,
        from: previous,
        to: subscription?.status,
        invoiceStatus: invoice?.status,
      },
    });
    const type = notificationFor(snapshot.internalType, subscription?.status);
    if (type) {
      await notifyAdmins({
        organizationId,
        type,
        payload: {
          name: subscription?.plan?.name ?? "Subscription",
          subscriptionId: subscription?.id,
          invoiceId: invoice?.id,
          status: subscription?.status,
        },
        dedupeKey: `${type}:${subscription?.id ?? "none"}:${invoice?.id ?? eventId ?? snapshot.internalType}`,
      });
    }
  }
  return { subscription, invoice, previous };
}

export async function applyPaymentEvent(paymentEventId: string) {
  const event = await prisma.paymentEvent.findUnique({ where: { id: paymentEventId } });
  if (!event) return { skipped: true as const, reason: "missing" };
  if (event.status === "PROCESSED" || event.status === "IGNORED") {
    return { skipped: true as const, reason: event.status };
  }

  const payload = (event.payload ?? {}) as StoredPaymentPayload;
  if (!payload.snapshot || payload.internalType === "UNSUPPORTED") {
    await prisma.paymentEvent.update({
      where: { id: event.id },
      data: { status: "IGNORED", processedAt: new Date(), attempts: { increment: 1 } },
    });
    return { skipped: true as const, reason: "unsupported" };
  }

  try {
    const applied = await applyBillingSnapshot(payload.snapshot, event.id);
    await prisma.paymentEvent.update({
      where: { id: event.id },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        failedAt: null,
        lastError: null,
        attempts: { increment: 1 },
        organizationId: applied.subscription?.organizationId ?? applied.invoice?.organizationId ?? event.organizationId,
        subscriptionId: applied.subscription?.id ?? event.subscriptionId,
        invoiceId: applied.invoice?.id ?? event.invoiceId,
      },
    });
    return { skipped: false as const, applied };
  } catch (error) {
    const message = error instanceof Error ? error.message : "apply failed";
    await prisma.paymentEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", failedAt: new Date(), lastError: message.slice(0, 500), attempts: { increment: 1 } },
    });
    throw error;
  }
}

export async function applyProviderSubscription(input: {
  subscriptionId: string;
  snapshot: SubscriptionSnapshot;
}) {
  const current = await prisma.subscription.findUnique({ where: { id: input.subscriptionId } });
  if (!current) return null;
  if (current.provider !== input.snapshot.provider) {
    logger.error({ subscriptionId: current.id, billingProvider: input.snapshot.provider }, "reconcile provider mismatch");
    return current;
  }
  if (current.providerSubscriptionId && current.providerSubscriptionId !== input.snapshot.externalId) {
    logger.error({ subscriptionId: current.id, externalSubscriptionId: input.snapshot.externalId }, "reconcile id mismatch");
    return current;
  }
  const currency = validCurrency(input.snapshot.currency);
  if (!currency) {
    logger.error({ subscriptionId: current.id }, "reconcile rejected malformed currency");
    return current;
  }
  return applySubscription({ ...input.snapshot, currency }, current.organizationId);
}

export function invoiceStatusLabel(status: InvoiceStatus) {
  return status;
}

export function subscriptionIsOpen(status: SubscriptionStatus) {
  return OPEN.includes(status);
}

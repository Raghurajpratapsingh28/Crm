import { createHmac } from "node:crypto";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetPaymentProviders } from "../../lib/payments/factory.js";
import { prisma } from "../../lib/prisma.js";
import { addMember, app, cleanupOrganization, cleanupUser, createUser } from "../../test/helpers.js";
import { applyPaymentEvent } from "./billing.apply.js";
import { reconcileSubscriptionById } from "./billing.service.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

beforeEach(() => {
  resetPaymentProviders();
});

async function orgWithRoles() {
  const admin = await createUser("billadmin");
  const manager = await createUser("billmgr");
  const member = await createUser("billmem");
  users.push(admin.id, manager.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Bill ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  const organizationId = created.body.data.id as string;
  await addMember(organizationId, manager, "MANAGER");
  await addMember(organizationId, member, "MEMBER");
  return { admin, manager, member, organizationId };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function planId(token: string) {
  const plans = await request(app).get("/api/v1/billing/plans").set(auth(token));
  expect(plans.status).toBe(200);
  expect(plans.body.data.plans.every((row: { stripePriceIdMonth?: string }) => !row.stripePriceIdMonth)).toBe(true);
  return plans.body.data.plans.find((row: { key: string }) => row.key === "pro").id as string;
}

function sign(body: string) {
  return createHmac("sha256", "whsec_test").update(body).digest("hex");
}

describe("plans", () => {
  it("returns active plans and hides inactive ones", async () => {
    const ctx = await orgWithRoles();
    const listed = await request(app).get("/api/v1/billing/plans").set(auth(ctx.member.token));
    expect(listed.status).toBe(200);
    expect(listed.body.data.plans.length).toBeGreaterThan(0);
    await prisma.billingPlan.update({ where: { key: "business" }, data: { active: false } });
    const again = await request(app).get("/api/v1/billing/plans").set(auth(ctx.admin.token));
    expect(again.body.data.plans.some((row: { key: string }) => row.key === "business")).toBe(false);
    await prisma.billingPlan.update({ where: { key: "business" }, data: { active: true } });
  });
});

describe("checkout", () => {
  it("lets ADMIN start checkout and ignores client prices", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    const res = await request(app)
      .post("/api/v1/billing/checkout")
      .set(auth(ctx.admin.token))
      .set("Idempotency-Key", `ck-${ctx.organizationId}`)
      .send({ planId: id, provider: "STRIPE", billingInterval: "MONTH", amount: 1, currency: "USD" });
    expect(res.status).toBe(201);
    expect(res.body.data.checkoutUrl).toMatch(/checkout\.test/);
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    expect(sub.amount?.toString()).toBe("1999");
    expect(sub.currency).toBe("INR");
  });

  it("rejects members, managers, fake providers, and invalid plans", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    expect((await request(app).post("/api/v1/billing/checkout").set(auth(ctx.member.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" })).status).toBe(403);
    expect((await request(app).post("/api/v1/billing/checkout").set(auth(ctx.manager.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" })).status).toBe(403);
    const fake = await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "FAKE_PROVIDER", billingInterval: "MONTH" });
    expect(fake.status).toBe(400);
    const missing = await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: "00000000-0000-4000-8000-000000000099", provider: "STRIPE", billingInterval: "MONTH" });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("PLAN_NOT_FOUND");
  });

  it("ignores a client organizationId and is idempotent", async () => {
    const ctx = await orgWithRoles();
    const other = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    const spoof = await request(app)
      .post("/api/v1/billing/checkout")
      .set(auth(ctx.admin.token))
      .send({ planId: id, provider: "STRIPE", billingInterval: "MONTH", organizationId: other.organizationId });
    expect(spoof.status).toBe(400);
    const first = await request(app)
      .post("/api/v1/billing/checkout")
      .set(auth(ctx.admin.token))
      .set("Idempotency-Key", `same-${ctx.organizationId}`)
      .send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    const second = await request(app)
      .post("/api/v1/billing/checkout")
      .set(auth(ctx.admin.token))
      .set("Idempotency-Key", `same-${ctx.organizationId}`)
      .send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.sessionId).toBe(first.body.data.sessionId);
    expect(await prisma.subscription.count({ where: { organizationId: ctx.organizationId } })).toBe(1);
  });

  it("blocks a second active subscription", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    await prisma.subscription.updateMany({ where: { organizationId: ctx.organizationId }, data: { status: "ACTIVE" } });
    const again = await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "RAZORPAY", billingInterval: "MONTH" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("SUBSCRIPTION_ALREADY_ACTIVE");
  });
});

describe("subscription and invoices", () => {
  it("returns empty subscription without failing and hides foreign invoices", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const empty = await request(app).get("/api/v1/billing/subscription").set(auth(a.admin.token));
    expect(empty.status).toBe(200);
    expect(empty.body.data.subscription).toBeNull();

    const plan = await planId(b.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(b.admin.token)).send({ planId: plan, provider: "STRIPE", billingInterval: "MONTH" });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: b.organizationId } });
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: b.organizationId,
        subscriptionId: sub.id,
        provider: "STRIPE",
        providerInvoiceId: `inv_${b.organizationId.slice(0, 8)}`,
        amount: "1999.00",
        currency: "INR",
        status: "PAID",
      },
    });
    expect((await request(app).get(`/api/v1/billing/invoices/${invoice.id}`).set(auth(a.admin.token))).status).toBe(404);
    expect((await request(app).get("/api/v1/billing/subscription").set(auth(a.admin.token))).body.data.subscription).toBeNull();
    expect((await request(app).get("/api/v1/billing/invoices").set(auth(a.manager.token))).status).toBe(403);
  });

  it("cancels at period end and treats a second cancel as idempotent", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    await prisma.subscription.updateMany({
      where: { organizationId: ctx.organizationId },
      data: { status: "ACTIVE", providerSubscriptionId: `sub_stripe_${ctx.organizationId.slice(0, 8)}` },
    });
    const cancel = await request(app).post("/api/v1/billing/subscription/cancel").set(auth(ctx.admin.token)).send({ immediately: false });
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.cancelAtPeriodEnd).toBe(true);
    const again = await request(app).post("/api/v1/billing/subscription/cancel").set(auth(ctx.admin.token)).send({});
    expect(again.status).toBe(200);
  });
});

describe("webhooks", () => {
  it("rejects invalid signatures and accepts verified Stripe-shaped events", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    const body = JSON.stringify({
      id: "evt_stripe_1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: sub.providerSubscriptionId,
          object: "subscription",
          customer: sub.providerCustomerId,
          status: "active",
          currency: "inr",
          current_period_start: 1756684800,
          current_period_end: 1759276800,
        },
      },
    });
    const bad = await request(app).post("/webhooks/stripe").set("Content-Type", "application/json").set("stripe-signature", "nope").send(body);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_WEBHOOK");
    expect(await prisma.paymentEvent.count({ where: { providerEventId: "evt_stripe_1" } })).toBe(0);

    const ok = await request(app).post("/webhooks/stripe").set("Content-Type", "application/json").set("stripe-signature", sign(body)).send(body);
    expect(ok.status).toBe(200);
    const updated = await prisma.subscription.findFirstOrThrow({ where: { id: sub.id } });
    expect(updated.status).toBe("ACTIVE");
    expect(await prisma.auditLog.count({ where: { organizationId: ctx.organizationId, action: "SUBSCRIPTION_UPDATED" } })).toBeGreaterThan(0);
  });

  it("is idempotent for replayed events", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "RAZORPAY", billingInterval: "MONTH" });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    const body = JSON.stringify({
      id: "evt_rzp_1",
      event: "subscription.activated",
      payload: { subscription: { entity: { id: sub.providerSubscriptionId, customer_id: sub.providerCustomerId, status: "active" } } },
    });
    const headers = { "Content-Type": "application/json", "x-razorpay-signature": sign(body), "x-razorpay-event-id": "evt_rzp_1" };
    const first = await request(app).post("/webhooks/razorpay").set(headers).send(body);
    const second = await request(app).post("/webhooks/razorpay").set(headers).send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(await prisma.paymentEvent.count({ where: { providerEventId: "evt_rzp_1" } })).toBe(1);
    expect(await prisma.subscription.count({ where: { organizationId: ctx.organizationId } })).toBe(1);
    const jobs = await prisma.job.count({ where: { organizationId: ctx.organizationId, type: "notification.fanout" } });
    const jobsAgain = await prisma.job.count({ where: { organizationId: ctx.organizationId, type: "notification.fanout" } });
    expect(jobsAgain).toBe(jobs);
  });

  it("ignores unknown verified events and supports payment failure", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    const unknown = JSON.stringify({ id: "evt_ping", type: "ping", data: { object: { id: "ok" } } });
    const ping = await request(app).post("/webhooks/stripe").set("Content-Type", "application/json").set("stripe-signature", sign(unknown)).send(unknown);
    expect(ping.status).toBe(200);
    expect((await prisma.paymentEvent.findFirstOrThrow({ where: { providerEventId: "evt_ping" } })).status).toBe("IGNORED");

    const failed = JSON.stringify({
      id: "evt_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_fail",
          object: "invoice",
          subscription: sub.providerSubscriptionId,
          customer: sub.providerCustomerId,
          status: "open",
          currency: "inr",
          amount_paid: 0,
          total: 199900,
        },
      },
    });
    await request(app).post("/webhooks/stripe").set("Content-Type", "application/json").set("stripe-signature", sign(failed)).send(failed);
    const invoice = await prisma.invoice.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    expect(invoice.status).toBe("FAILED");
    expect(await prisma.auditLog.count({ where: { organizationId: ctx.organizationId, action: "INVOICE_FAILED" } })).toBeGreaterThan(0);
    expect(await prisma.job.count({ where: { organizationId: ctx.organizationId, type: "payments.dunning" } })).toBeGreaterThan(0);
  });

  it("does not process an already processed event twice", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    const event = await prisma.paymentEvent.create({
      data: {
        organizationId: ctx.organizationId,
        provider: "STRIPE",
        providerEventId: "evt_processed",
        eventType: "invoice.paid",
        status: "PROCESSED",
        processedAt: new Date(),
        payload: { internalType: "INVOICE_PAID" },
      },
    });
    const again = await applyPaymentEvent(event.id);
    expect(again.skipped).toBe(true);
  });
});

describe("reconciliation", () => {
  it("moves internal state to the provider snapshot", async () => {
    const ctx = await orgWithRoles();
    const id = await planId(ctx.admin.token);
    await request(app).post("/api/v1/billing/checkout").set(auth(ctx.admin.token)).send({ planId: id, provider: "STRIPE", billingInterval: "MONTH" });
    const sub = await prisma.subscription.findFirstOrThrow({ where: { organizationId: ctx.organizationId } });
    await prisma.subscription.update({ where: { id: sub.id }, data: { status: "ACTIVE" } });
    const { getPaymentProvider } = await import("../../lib/payments/factory.js");
    const fake = getPaymentProvider("STRIPE");
    const remote = await fake.getSubscription(sub.providerSubscriptionId!);
    remote.status = "PAST_DUE";
    await reconcileSubscriptionById(sub.id);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("PAST_DUE");
    remote.status = "ACTIVE";
    await reconcileSubscriptionById(sub.id);
    expect((await prisma.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe("ACTIVE");
  });
});

describe("auth", () => {
  it("requires a session for billing APIs", async () => {
    expect((await request(app).get("/api/v1/billing/subscription")).status).toBe(401);
    expect((await request(app).post("/api/v1/billing/checkout").send({})).status).toBe(401);
  });
});

import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { addMember, app, cleanupOrganization, cleanupUser, createUser } from "../../test/helpers.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createOrg(options?: { timezone?: string; currency?: string; prefix?: string }) {
  const admin = await createUser(options?.prefix ?? "aadmin");
  const member = await createUser("amem");
  const other = await createUser("aother");
  users.push(admin.id, member.id, other.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set(auth(admin.token))
    .send({
      name: `Analytics ${admin.id.slice(0, 8)}`,
      timezone: options?.timezone ?? "UTC",
      currency: options?.currency ?? "INR",
    });
  expect(created.status).toBe(201);
  const organizationId = created.body.data.id as string;
  orgs.push(organizationId);
  await addMember(organizationId, member, "MEMBER");
  await addMember(organizationId, other, "MEMBER");
  const company = await prisma.company.create({ data: { organizationId, name: "Acme", ownerId: admin.id } });
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      firstName: "Pat",
      lastName: "Lee",
      email: `pat-${admin.id.slice(0, 8)}@analytics.test`,
      companyId: company.id,
      ownerId: admin.id,
    },
  });
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { organizationId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const stage = (name: string) => pipeline.stages.find((row) => row.name === name)!;
  return { admin, member, other, organizationId, company, contact, pipeline, stage };
}

async function deal(
  ctx: Awaited<ReturnType<typeof createOrg>>,
  input: {
    name: string;
    stage: string;
    amount?: string;
    currency?: string;
    ownerId?: string;
    wonAt?: Date | null;
    lostAt?: Date | null;
    expectedCloseDate?: Date | null;
    probability?: number;
    pipelineId?: string;
  },
) {
  const stage = ctx.pipeline.stages.find((row) => row.name === input.stage)!;
  return prisma.deal.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      companyId: ctx.company.id,
      primaryContactId: ctx.contact.id,
      pipelineId: input.pipelineId ?? ctx.pipeline.id,
      stageId: stage.id,
      ownerId: input.ownerId ?? ctx.admin.id,
      amount: input.amount,
      currency: input.currency ?? "INR",
      wonAt: input.wonAt,
      lostAt: input.lostAt,
      expectedCloseDate: input.expectedCloseDate,
      probability: input.probability ?? stage.probability,
    },
  });
}

const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

describe("analytics overview metrics", () => {
  it("computes September revenue, pipeline, and win rate from current deal state", async () => {
    const ctx = await createOrg();
    await deal(ctx, { name: "A", stage: "Won", amount: "100000.00", wonAt: new Date("2026-09-05T12:00:00.000Z") });
    await deal(ctx, { name: "B", stage: "Lost", amount: "200000.00", lostAt: new Date("2026-09-10T12:00:00.000Z") });
    await deal(ctx, {
      name: "C",
      stage: "Proposal",
      amount: "300000.00",
      expectedCloseDate: new Date("2026-09-25T00:00:00.000Z"),
      probability: 65,
    });
    await deal(ctx, { name: "D", stage: "Won", amount: "400000.00", wonAt: new Date("2026-08-20T12:00:00.000Z") });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.metrics.revenue.amount).toBe("100000.00");
    expect(res.body.data.metrics.revenue.currency).toBe("INR");
    expect(res.body.data.metrics.openDeals).toBe(1);
    expect(res.body.data.metrics.pipelineValue.amount).toBe("300000.00");
    expect(res.body.data.metrics.winRate.won).toBe(1);
    expect(res.body.data.metrics.winRate.lost).toBe(1);
    expect(res.body.data.metrics.winRate.value).toBe(50);
    expect(res.body.data.metrics.winRate.hasData).toBe(true);
  });

  it("uses won_at and excludes reopened or open deals from revenue", async () => {
    const ctx = await createOrg();
    await deal(ctx, { name: "Won in range", stage: "Won", amount: "100000.50", wonAt: new Date("2026-09-01T00:00:00.000Z") });
    await deal(ctx, { name: "Won after range", stage: "Won", amount: "900000.00", wonAt: new Date("2026-10-01T00:00:00.000Z") });
    await deal(ctx, { name: "Open", stage: "Qualified", amount: "50000.00", expectedCloseDate: new Date("2026-09-15") });
    await deal(ctx, { name: "Lost", stage: "Lost", amount: "80000.00", lostAt: new Date("2026-09-12T00:00:00.000Z") });
    const reopened = await deal(ctx, {
      name: "Reopened",
      stage: "Proposal",
      amount: "70000.00",
      expectedCloseDate: new Date("2026-09-20"),
    });
    await prisma.deal.update({ where: { id: reopened.id }, data: { wonAt: null, lostAt: null } });
    await deal(ctx, { name: "Zero", stage: "Won", amount: "0.00", wonAt: new Date("2026-09-08T00:00:00.000Z") });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.metrics.revenue.amount).toBe("100000.50");
    expect(res.body.data.metrics.winRate.won).toBe(2);
    expect(res.body.data.metrics.winRate.lost).toBe(1);
  });

  it("counts current Lead-stage deals only", async () => {
    const ctx = await createOrg();
    for (let i = 0; i < 5; i += 1) await deal(ctx, { name: `Lead ${i}`, stage: "Lead", amount: "1" });
    for (let i = 0; i < 3; i += 1) await deal(ctx, { name: `Contacted ${i}`, stage: "Contacted", amount: "1" });
    await deal(ctx, { name: "Won 1", stage: "Won", amount: "1", wonAt: new Date("2026-09-02T00:00:00.000Z") });
    await deal(ctx, { name: "Won 2", stage: "Won", amount: "1", wonAt: new Date("2026-09-03T00:00:00.000Z") });
    await deal(ctx, { name: "Lost", stage: "Lost", amount: "1", lostAt: new Date("2026-09-04T00:00:00.000Z") });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.body.data.metrics.leads).toBe(5);
    expect(res.body.data.metrics.openDeals).toBe(8);
  });

  it("counts follow-ups in SQL and never treats completed tasks as overdue", async () => {
    const ctx = await createOrg();
    await prisma.task.create({
      data: {
        organizationId: ctx.organizationId,
        title: "Future",
        assigneeId: ctx.admin.id,
        createdById: ctx.admin.id,
        status: "OPEN",
        dueDate: new Date("2026-09-25T12:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        organizationId: ctx.organizationId,
        title: "Overdue",
        assigneeId: ctx.admin.id,
        createdById: ctx.admin.id,
        status: "OPEN",
        dueDate: new Date("2020-01-01T00:00:00.000Z"),
      },
    });
    await prisma.task.create({
      data: {
        organizationId: ctx.organizationId,
        title: "Done overdue",
        assigneeId: ctx.admin.id,
        createdById: ctx.admin.id,
        status: "DONE",
        completedAt: new Date("2026-09-02T00:00:00.000Z"),
        dueDate: new Date("2020-01-01T00:00:00.000Z"),
      },
    });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.body.data.metrics.followUps.open).toBe(2);
    expect(res.body.data.metrics.followUps.overdue).toBe(1);
  });

  it("returns newest activities first and isolates tenants", async () => {
    const a = await createOrg({ prefix: "acta" });
    const b = await createOrg({ prefix: "actb" });
    const older = await prisma.activity.create({
      data: {
        organizationId: a.organizationId,
        type: "NOTE",
        authorId: a.admin.id,
        content: "older",
        dealId: (await deal(a, { name: "A deal", stage: "Lead" })).id,
        occurredAt: new Date("2026-09-01T10:00:00.000Z"),
      },
    });
    const newer = await prisma.activity.create({
      data: {
        organizationId: a.organizationId,
        type: "CALL",
        authorId: a.admin.id,
        content: "newer",
        dealId: older.dealId,
        occurredAt: new Date("2026-09-20T10:00:00.000Z"),
      },
    });
    await prisma.activity.create({
      data: {
        organizationId: b.organizationId,
        type: "NOTE",
        authorId: b.admin.id,
        content: "other org",
        dealId: (await deal(b, { name: "B deal", stage: "Lead" })).id,
        occurredAt: new Date("2026-09-21T10:00:00.000Z"),
      },
    });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(a.admin.token));
    const ids = res.body.data.recentActivity.map((row: { id: string }) => row.id);
    expect(ids[0]).toBe(newer.id);
    expect(ids).toContain(older.id);
    expect(res.body.data.recentActivity.some((row: { content: string }) => row.content === "other org")).toBe(false);
  });

  it("never includes another organization's deals in revenue", async () => {
    const a = await createOrg({ prefix: "tena" });
    const b = await createOrg({ prefix: "tenb" });
    await deal(a, { name: "A won", stage: "Won", amount: "100000.00", wonAt: new Date("2026-09-05T00:00:00.000Z") });
    await deal(b, { name: "B won", stage: "Won", amount: "999999.00", wonAt: new Date("2026-09-05T00:00:00.000Z") });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(a.admin.token));
    expect(res.body.data.metrics.revenue.amount).toBe("100000.00");
  });

  it("scopes MEMBER metrics to owned deals", async () => {
    const ctx = await createOrg();
    await deal(ctx, {
      name: "Member won",
      stage: "Won",
      amount: "25000.00",
      ownerId: ctx.member.id,
      wonAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "Admin won",
      stage: "Won",
      amount: "80000.00",
      ownerId: ctx.admin.id,
      wonAt: new Date("2026-09-05T00:00:00.000Z"),
    });

    const member = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.member.token));
    expect(member.status).toBe(200);
    expect(member.body.data.metrics.revenue.amount).toBe("25000.00");
    expect(member.body.data.metrics.winRate.won).toBe(1);

    const admin = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(admin.body.data.metrics.revenue.amount).toBe("105000.00");
  });

  it("returns empty-org zeros without error", async () => {
    const ctx = await createOrg();
    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.metrics.revenue.amount).toBe("0.00");
    expect(res.body.data.metrics.openDeals).toBe(0);
    expect(res.body.data.metrics.winRate).toMatchObject({ value: 0, hasData: false, won: 0, lost: 0 });
    expect(res.body.data.recentActivity).toEqual([]);
  });
});

describe("analytics filters and security", () => {
  it("rejects inverted ranges, invalid owners, and member team filters", async () => {
    const ctx = await createOrg();
    const inverted = await request(app)
      .get("/api/v1/analytics/overview")
      .query({ from: "2026-09-30", to: "2026-09-01" })
      .set(auth(ctx.admin.token));
    expect(inverted.status).toBe(400);
    expect(inverted.body.error.code).toBe("INVALID_DATE_RANGE");

    const missing = await request(app)
      .get("/api/v1/analytics/overview")
      .query({ ...SEPTEMBER, ownerId: randomUUID() })
      .set(auth(ctx.admin.token));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("INVALID_OWNER");

    const foreignUser = await createUser("foreign");
    users.push(foreignUser.id);
    const foreign = await request(app)
      .get("/api/v1/analytics/overview")
      .query({ ...SEPTEMBER, ownerId: foreignUser.id })
      .set(auth(ctx.admin.token));
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe("INVALID_OWNER");

    const team = await request(app)
      .get("/api/v1/analytics/overview")
      .query({ ...SEPTEMBER, teamId: "SALES" })
      .set(auth(ctx.member.token));
    expect(team.status).toBe(403);

    const board = await request(app)
      .get("/api/v1/analytics/leaderboard")
      .query(SEPTEMBER)
      .set(auth(ctx.member.token));
    expect(board.status).toBe(403);
  });

  it("filters owner A without including owner B", async () => {
    const ctx = await createOrg();
    await deal(ctx, {
      name: "A",
      stage: "Won",
      amount: "10000.00",
      ownerId: ctx.member.id,
      wonAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "B",
      stage: "Won",
      amount: "40000.00",
      ownerId: ctx.other.id,
      wonAt: new Date("2026-09-05T00:00:00.000Z"),
    });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query({ ...SEPTEMBER, ownerId: ctx.member.id })
      .set(auth(ctx.admin.token));
    expect(res.body.data.metrics.revenue.amount).toBe("10000.00");
    expect(res.body.data.metrics.winRate.won).toBe(1);
  });

  it("assigns Kolkata calendar dates using organization timezone", async () => {
    const ctx = await createOrg({ timezone: "Asia/Kolkata", currency: "INR" });
    await deal(ctx, {
      name: "Sep 1 IST",
      stage: "Won",
      amount: "1000.00",
      wonAt: new Date("2026-08-31T18:30:00.000Z"),
    });
    await deal(ctx, {
      name: "Oct 1 IST",
      stage: "Won",
      amount: "9000.00",
      wonAt: new Date("2026-09-30T18:30:00.000Z"),
    });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.body.data.metrics.revenue.amount).toBe("1000.00");
    expect(res.body.data.period.timeZone).toBe("Asia/Kolkata");
  });

  it("does not add INR and USD together", async () => {
    const ctx = await createOrg();
    await deal(ctx, { name: "INR", stage: "Won", amount: "1250000.00", currency: "INR", wonAt: new Date("2026-09-05T00:00:00.000Z") });
    await deal(ctx, { name: "USD", stage: "Won", amount: "5000.00", currency: "USD", wonAt: new Date("2026-09-05T00:00:00.000Z") });

    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.body.data.metrics.revenue.mixed).toBe(true);
    expect(res.body.data.metrics.revenue.amount).toBeNull();
    expect(res.body.data.metrics.revenue.byCurrency).toEqual(
      expect.arrayContaining([
        { currency: "INR", amount: "1250000.00" },
        { currency: "USD", amount: "5000.00" },
      ]),
    );
  });
});

describe("analytics pipeline, revenue, win-rate, leaderboard", () => {
  it("aggregates current stage amounts and excludes won/lost from open pipeline", async () => {
    const ctx = await createOrg();
    await deal(ctx, { name: "Lead", stage: "Lead", amount: "100000.00", expectedCloseDate: new Date("2026-09-10"), probability: 10 });
    await deal(ctx, { name: "Qualified", stage: "Qualified", amount: "200000.00", expectedCloseDate: new Date("2026-09-10"), probability: 35 });
    await deal(ctx, { name: "Proposal", stage: "Proposal", amount: "300000.00", expectedCloseDate: new Date("2026-09-10"), probability: 65 });
    await deal(ctx, { name: "Won", stage: "Won", amount: "500000.00", wonAt: new Date("2026-09-10T00:00:00.000Z") });
    await deal(ctx, { name: "Lost", stage: "Lost", amount: "100000.00", lostAt: new Date("2026-09-10T00:00:00.000Z") });

    const pipeline = await request(app)
      .get("/api/v1/analytics/pipeline")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(pipeline.status).toBe(200);
    const names = pipeline.body.data.stages.map((row: { name: string }) => row.name);
    expect(names).toEqual(["Lead", "Contacted", "Qualified", "Meeting", "Proposal", "Negotiation", "Won", "Lost"]);
    const byName = Object.fromEntries(
      pipeline.body.data.stages.map((row: { name: string; amount: string; dealCount: number; weightedAmount: string }) => [
        row.name,
        row,
      ]),
    );
    expect(byName.Lead.dealCount).toBe(1);
    expect(byName.Lead.amount).toBe("100000.00");
    expect(byName.Lead.weightedAmount).toBe("10000.00");
    expect(byName.Qualified.weightedAmount).toBe("70000.00");
    expect(byName.Proposal.weightedAmount).toBe("195000.00");

    const overview = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(overview.body.data.metrics.pipelineValue.amount).toBe("600000.00");
    expect(overview.body.data.metrics.weightedPipelineValue.amount).toBe("275000.00");
  });

  it("returns monthly revenue series including empty months", async () => {
    const ctx = await createOrg();
    await deal(ctx, { name: "Jan", stage: "Won", amount: "500000.00", wonAt: new Date("2026-01-15T00:00:00.000Z") });
    await deal(ctx, { name: "Mar", stage: "Won", amount: "720000.00", wonAt: new Date("2026-03-15T00:00:00.000Z") });

    const res = await request(app)
      .get("/api/v1/analytics/revenue")
      .query({ from: "2026-01-01", to: "2026-03-31", groupBy: "month" })
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.series).toEqual([
      { period: "2026-01", amount: "500000.00", byCurrency: [{ currency: "INR", amount: "500000.00" }] },
      { period: "2026-02", amount: "0.00", byCurrency: [] },
      { period: "2026-03", amount: "720000.00", byCurrency: [{ currency: "INR", amount: "720000.00" }] },
    ]);
  });

  it("computes win-rate series and documented zero cases", async () => {
    const ctx = await createOrg();
    for (let i = 0; i < 10; i += 1) {
      await deal(ctx, { name: `W${i}`, stage: "Won", amount: "1", wonAt: new Date("2026-09-05T00:00:00.000Z") });
      await deal(ctx, { name: `L${i}`, stage: "Lost", amount: "1", lostAt: new Date("2026-09-06T00:00:00.000Z") });
    }
    const fifty = await request(app)
      .get("/api/v1/analytics/win-rate")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(fifty.body.data.winRate).toBe(50);
    expect(fifty.body.data.won).toBe(10);
    expect(fifty.body.data.lost).toBe(10);

    const empty = await createOrg({ prefix: "emptywr" });
    const none = await request(app)
      .get("/api/v1/analytics/win-rate")
      .query(SEPTEMBER)
      .set(auth(empty.admin.token));
    expect(none.body.data).toMatchObject({ won: 0, lost: 0, winRate: 0, hasData: false });
  });

  it("returns factual leaderboard metrics without ranking language", async () => {
    const ctx = await createOrg();
    await prisma.organizationMember.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.member.id },
      data: { department: "SALES" },
    });
    await prisma.organizationMember.updateMany({
      where: { organizationId: ctx.organizationId, userId: ctx.other.id },
      data: { department: "SALES" },
    });
    await deal(ctx, {
      name: "A1",
      stage: "Won",
      amount: "100000.00",
      ownerId: ctx.member.id,
      wonAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "A2",
      stage: "Won",
      amount: "100000.00",
      ownerId: ctx.member.id,
      wonAt: new Date("2026-09-06T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "A open",
      stage: "Proposal",
      amount: "500000.00",
      ownerId: ctx.member.id,
      expectedCloseDate: new Date("2026-09-20"),
    });
    await deal(ctx, {
      name: "B1",
      stage: "Won",
      amount: "50000.00",
      ownerId: ctx.other.id,
      wonAt: new Date("2026-09-05T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "B2",
      stage: "Won",
      amount: "50000.00",
      ownerId: ctx.other.id,
      wonAt: new Date("2026-09-06T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "B3",
      stage: "Won",
      amount: "50000.00",
      ownerId: ctx.other.id,
      wonAt: new Date("2026-09-07T00:00:00.000Z"),
    });
    await deal(ctx, {
      name: "B open",
      stage: "Qualified",
      amount: "700000.00",
      ownerId: ctx.other.id,
      expectedCloseDate: new Date("2026-09-22"),
    });

    const res = await request(app)
      .get("/api/v1/analytics/leaderboard")
      .query({ ...SEPTEMBER, sortBy: "dealsWon" })
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    const member = res.body.data.members.find((row: { userId: string }) => row.userId === ctx.member.id);
    const other = res.body.data.members.find((row: { userId: string }) => row.userId === ctx.other.id);
    expect(member).toMatchObject({ dealsWon: 2, revenue: "200000.00", openPipeline: "500000.00" });
    expect(other).toMatchObject({ dealsWon: 3, revenue: "150000.00", openPipeline: "700000.00" });
  });

  it("returns a controlled empty pipeline payload when none exist", async () => {
    const ctx = await createOrg();
    await prisma.deal.deleteMany({ where: { organizationId: ctx.organizationId } });
    await prisma.pipelineStage.deleteMany({ where: { organizationId: ctx.organizationId } });
    await prisma.pipeline.deleteMany({ where: { organizationId: ctx.organizationId } });

    const res = await request(app)
      .get("/api/v1/analytics/pipeline")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.pipeline).toBeNull();
    expect(res.body.data.stages).toEqual([]);
  });

  it("runs overview over a larger fixture without loading deals in the app", async () => {
    const ctx = await createOrg({ prefix: "perf" });
    const rows = [];
    for (let i = 0; i < 80; i += 1) {
      rows.push({
        organizationId: ctx.organizationId,
        name: `Perf ${i}`,
        companyId: ctx.company.id,
        primaryContactId: ctx.contact.id,
        pipelineId: ctx.pipeline.id,
        stageId: ctx.pipeline.stages[i % 8]!.id,
        ownerId: ctx.admin.id,
        amount: "1000.00",
        currency: "INR",
        expectedCloseDate: new Date("2026-09-15"),
        wonAt: i % 8 === 6 ? new Date("2026-09-08T00:00:00.000Z") : null,
        lostAt: i % 8 === 7 ? new Date("2026-09-09T00:00:00.000Z") : null,
      });
    }
    await prisma.deal.createMany({ data: rows });
    const started = Date.now();
    const res = await request(app)
      .get("/api/v1/analytics/overview")
      .query(SEPTEMBER)
      .set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.metrics.openDeals).toBe(60);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { addMember, app, cleanupOrganization, cleanupUser, createUser } from "../../test/helpers.js";
import { failNextDealTransition } from "./deal.service.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

async function orgWithRoles() {
  const admin = await createUser("dadmin");
  const member = await createUser("dmem");
  users.push(admin.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Deal ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  await addMember(created.body.data.id, member, "MEMBER");
  return { admin, member, organizationId: created.body.data.id as string };
}

async function seedDeal(organizationId: string, ownerId: string) {
  const company = await prisma.company.create({ data: { organizationId, name: "Acme", ownerId } });
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      firstName: "Pat",
      lastName: "Lee",
      email: `pat-${ownerId.slice(0, 8)}@deal.test`,
      companyId: company.id,
      ownerId,
    },
  });
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { organizationId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  return { company, contact, pipeline };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("deals and pipeline", () => {
  it("creates a deal with stage default probability and initial history", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const proposal = seed.pipeline.stages.find((s) => s.name === "Proposal")!;

    const res = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({
        name: "Acme Enterprise",
        companyId: seed.company.id,
        primaryContactId: seed.contact.id,
        pipelineId: seed.pipeline.id,
        stageId: proposal.id,
        amount: 250000,
        currency: "INR",
      });
    expect(res.status).toBe(201);
    expect(res.body.data.probability).toBe(65);
    expect(res.body.data.probabilitySource).toBe("STAGE_DEFAULT");

    const history = await prisma.dealStageHistory.count({ where: { dealId: res.body.data.id } });
    expect(history).toBe(1);
  });

  it("preserves manual probability when stage changes", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const proposal = seed.pipeline.stages.find((s) => s.name === "Proposal")!;
    const negotiation = seed.pipeline.stages.find((s) => s.name === "Negotiation")!;

    const created = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({
        name: "Manual Prob",
        companyId: seed.company.id,
        primaryContactId: seed.contact.id,
        stageId: proposal.id,
        probability: 72,
      });

    const moved = await request(app)
      .post(`/api/v1/deals/${created.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: negotiation.id });
    expect(moved.status).toBe(200);
    expect(moved.body.data.probability).toBe(72);
    expect(moved.body.data.probabilitySource).toBe("MANUAL");
  });

  it("requires lost reason and records won/lost timestamps", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const lost = seed.pipeline.stages.find((s) => s.isLost)!;
    const won = seed.pipeline.stages.find((s) => s.isWon)!;

    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({
        name: "Lost Deal",
        companyId: seed.company.id,
        primaryContactId: seed.contact.id,
      });

    const blocked = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: lost.id });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe("LOST_REASON_REQUIRED");

    const lostOk = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: lost.id, lostReason: "Budget constraints" });
    expect(lostOk.status).toBe(200);
    expect(lostOk.body.data.lostAt).toBeTruthy();

    const wonMove = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: won.id });
    expect(wonMove.status).toBe(200);
    expect(wonMove.body.data.wonAt).toBeTruthy();
    expect(wonMove.body.data.probability).toBe(100);
  });

  it("is idempotent when moving to the same stage", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Same", companyId: seed.company.id, primaryContactId: seed.contact.id });

    const before = await prisma.dealStageHistory.count({ where: { dealId: deal.body.data.id } });
    const again = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: deal.body.data.stageId });
    expect(again.status).toBe(200);
    const after = await prisma.dealStageHistory.count({ where: { dealId: deal.body.data.id } });
    expect(after).toBe(before);
  });

  it("resets probability to stage default", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({
        name: "Reset",
        companyId: seed.company.id,
        primaryContactId: seed.contact.id,
        probability: 72,
      });

    const reset = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/reset-probability`)
      .set(auth(ctx.admin.token));
    expect(reset.status).toBe(200);
    expect(reset.body.data.probabilitySource).toBe("STAGE_DEFAULT");
  });

  it("returns kanban and summary for the pipeline", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Board Deal", companyId: seed.company.id, primaryContactId: seed.contact.id });

    const kanban = await request(app)
      .get(`/api/v1/pipelines/${seed.pipeline.id}/kanban`)
      .set(auth(ctx.admin.token));
    expect(kanban.status).toBe(200);
    expect(kanban.body.data.stages.length).toBeGreaterThan(0);

    const summary = await request(app)
      .get(`/api/v1/pipelines/${seed.pipeline.id}/summary`)
      .set(auth(ctx.admin.token));
    expect(summary.status).toBe(200);
    expect(summary.body.data.overall.dealCount).toBeGreaterThan(0);
  });

  it("blocks cross-tenant deal access", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const seed = await seedDeal(b.organizationId, b.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(b.admin.token))
      .send({ name: "Secret", companyId: seed.company.id, primaryContactId: seed.contact.id });

    const read = await request(app).get(`/api/v1/deals/${deal.body.data.id}`).set(auth(a.admin.token));
    expect(read.status).toBe(404);
  });

  it("rejects cross-tenant company, contact, and owner assignment", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const local = await seedDeal(a.organizationId, a.admin.id);
    const foreign = await seedDeal(b.organizationId, b.admin.id);

    const company = await request(app)
      .post("/api/v1/deals")
      .set(auth(a.admin.token))
      .send({ name: "Bad company", companyId: foreign.company.id, primaryContactId: local.contact.id });
    expect(company.status).toBe(400);
    expect(company.body.error.code).toBe("INVALID_COMPANY");

    const contact = await request(app)
      .post("/api/v1/deals")
      .set(auth(a.admin.token))
      .send({ name: "Bad contact", companyId: local.company.id, primaryContactId: foreign.contact.id });
    expect(contact.status).toBe(400);
    expect(contact.body.error.code).toBe("INVALID_CONTACT");

    const created = await request(app)
      .post("/api/v1/deals")
      .set(auth(a.admin.token))
      .send({ name: "Owner check", companyId: local.company.id, primaryContactId: local.contact.id });

    const owner = await request(app)
      .post(`/api/v1/deals/${created.body.data.id}/assign`)
      .set(auth(a.admin.token))
      .send({ ownerId: b.admin.id });
    expect(owner.status).toBe(400);
    expect(owner.body.error.code).toBe("INVALID_OWNER");
  });

  it("enforces MEMBER visibility, delete, and assignment permissions", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const adminDeal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Admin owned", companyId: seed.company.id, primaryContactId: seed.contact.id });

    const hidden = await request(app).get(`/api/v1/deals/${adminDeal.body.data.id}`).set(auth(ctx.member.token));
    expect(hidden.status).toBe(404);

    const steal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.member.token))
      .send({ name: "Linked to hidden company", companyId: seed.company.id, primaryContactId: seed.contact.id });
    expect(steal.status).toBe(404);

    const memberCompany = await prisma.company.create({
      data: { organizationId: ctx.organizationId, name: "Member Co", ownerId: ctx.member.id },
    });
    const memberContact = await prisma.contact.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: "Mem",
        lastName: "Ber",
        email: `mem-${ctx.member.id.slice(0, 8)}@deal.test`,
        companyId: memberCompany.id,
        ownerId: ctx.member.id,
      },
    });
    const own = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.member.token))
      .send({ name: "Member deal", companyId: memberCompany.id, primaryContactId: memberContact.id });
    expect(own.status).toBe(201);

    const deleted = await request(app).delete(`/api/v1/deals/${own.body.data.id}`).set(auth(ctx.member.token));
    expect(deleted.status).toBe(403);

    const assigned = await request(app)
      .post(`/api/v1/deals/${own.body.data.id}/assign`)
      .set(auth(ctx.member.token))
      .send({ ownerId: ctx.admin.id });
    expect(assigned.status).toBe(403);

    const patched = await request(app)
      .patch(`/api/v1/deals/${own.body.data.id}`)
      .set(auth(ctx.member.token))
      .send({ ownerId: ctx.admin.id });
    expect(patched.status).toBe(200);
    expect(patched.body.data.ownerId).toBe(ctx.member.id);
  });

  it("rejects stage changes through generic PATCH", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "No patch stage", companyId: seed.company.id, primaryContactId: seed.contact.id });
    const negotiation = seed.pipeline.stages.find((s) => s.name === "Negotiation")!;
    const blocked = await request(app)
      .patch(`/api/v1/deals/${deal.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ stageId: negotiation.id });
    expect(blocked.status).toBe(400);
  });

  it("rolls back deal, history, activity, and audit when a later step fails", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Rollback", companyId: seed.company.id, primaryContactId: seed.contact.id });
    const originalStage = deal.body.data.stageId as string;
    const negotiation = seed.pipeline.stages.find((s) => s.name === "Negotiation")!;

    failNextDealTransition("audit");
    const failed = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: negotiation.id });
    failNextDealTransition(null);
    expect(failed.status).toBeGreaterThanOrEqual(500);

    const persisted = await prisma.deal.findUniqueOrThrow({ where: { id: deal.body.data.id } });
    expect(persisted.stageId).toBe(originalStage);
    expect(await prisma.dealStageHistory.count({ where: { dealId: deal.body.data.id } })).toBe(1);
    expect(await prisma.activity.count({ where: { dealId: deal.body.data.id, type: "STATUS_CHANGE" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: deal.body.data.id, action: "DEAL_STAGE_CHANGED" } })).toBe(0);
  });

  it("keeps concurrent stage transitions consistent", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Race", companyId: seed.company.id, primaryContactId: seed.contact.id, amount: 10000 });
    const negotiation = seed.pipeline.stages.find((s) => s.name === "Negotiation")!;
    const lost = seed.pipeline.stages.find((s) => s.isLost)!;

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/v1/deals/${deal.body.data.id}/stage`)
        .set(auth(ctx.admin.token))
        .send({ stageId: negotiation.id }),
      request(app)
        .post(`/api/v1/deals/${deal.body.data.id}/stage`)
        .set(auth(ctx.admin.token))
        .send({ stageId: lost.id, lostReason: "Budget constraints" }),
    ]);

    expect([first.status, second.status].every((status) => status === 200)).toBe(true);
    const persisted = await prisma.deal.findUniqueOrThrow({ where: { id: deal.body.data.id } });
    expect([negotiation.id, lost.id]).toContain(persisted.stageId);
    const history = await prisma.dealStageHistory.findMany({
      where: { dealId: deal.body.data.id },
      orderBy: { changedAt: "asc" },
    });
    expect(history.length).toBe(3);
    expect(history[history.length - 1]?.toStageId).toBe(persisted.stageId);
    for (let i = 1; i < history.length; i += 1) {
      expect(history[i]?.fromStageId).toBe(history[i - 1]?.toStageId);
    }
  });

  it("enqueues a notification job when a deal is assigned to someone else", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Assign me", companyId: seed.company.id, primaryContactId: seed.contact.id });

    const assigned = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/assign`)
      .set(auth(ctx.admin.token))
      .send({ ownerId: ctx.member.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.ownerId).toBe(ctx.member.id);

    const jobs = await prisma.job.findMany({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
    });
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.some((job) => JSON.stringify(job.payload).includes(deal.body.data.id))).toBe(true);
    expect(jobs.some((job) => JSON.stringify(job.payload).includes("DEAL_ASSIGNED"))).toBe(true);
  });

  it("does not notify the actor for self-assignment", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const deal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Mine", companyId: seed.company.id, primaryContactId: seed.contact.id, ownerId: ctx.admin.id });
    await prisma.job.deleteMany({ where: { organizationId: ctx.organizationId, type: "notification.fanout" } });
    const assigned = await request(app)
      .post(`/api/v1/deals/${deal.body.data.id}/assign`)
      .set(auth(ctx.admin.token))
      .send({ ownerId: ctx.admin.id });
    expect(assigned.status).toBe(200);
    const jobs = await prisma.job.count({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
    });
    expect(jobs).toBe(0);
  });

  it("enqueues historical stage jobs for negotiation, won, and lost", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const created = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Acme Enterprise Contract", companyId: seed.company.id, primaryContactId: seed.contact.id });
    await request(app)
      .post(`/api/v1/deals/${created.body.data.id}/assign`)
      .set(auth(ctx.admin.token))
      .send({ ownerId: ctx.member.id });

    const negotiation = seed.pipeline.stages.find((s) => s.name === "Negotiation")!;
    const moved = await request(app)
      .post(`/api/v1/deals/${created.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: negotiation.id });
    expect(moved.status).toBe(200);

    const history = await prisma.dealStageHistory.findFirstOrThrow({
      where: { dealId: created.body.data.id },
      orderBy: { changedAt: "desc" },
    });
    const jobs = await prisma.job.findMany({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
      orderBy: { createdAt: "desc" },
    });
    const stageJob = jobs.find((job) => JSON.stringify(job.payload).includes("DEAL_STAGE_CHANGED"));
    expect(stageJob).toBeTruthy();
    expect(JSON.stringify(stageJob?.payload)).toContain(history.id);
    expect(JSON.stringify(stageJob?.payload)).toContain("Negotiation");

    const won = seed.pipeline.stages.find((s) => s.isWon)!;
    await request(app)
      .post(`/api/v1/deals/${created.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: won.id });
    const afterWon = await prisma.job.findMany({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
    });
    expect(afterWon.some((job) => JSON.stringify(job.payload).includes("DEAL_WON"))).toBe(true);

    const lostDeal = await request(app)
      .post("/api/v1/deals")
      .set(auth(ctx.admin.token))
      .send({ name: "Lost deal", companyId: seed.company.id, primaryContactId: seed.contact.id });
    await request(app)
      .post(`/api/v1/deals/${lostDeal.body.data.id}/assign`)
      .set(auth(ctx.admin.token))
      .send({ ownerId: ctx.member.id });
    const lost = seed.pipeline.stages.find((s) => s.isLost)!;
    await request(app)
      .post(`/api/v1/deals/${lostDeal.body.data.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: lost.id, lostReason: "Budget constraints" });
    const afterLost = await prisma.job.findMany({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
    });
    expect(afterLost.some((job) => JSON.stringify(job.payload).includes("DEAL_LOST"))).toBe(true);
  });
});

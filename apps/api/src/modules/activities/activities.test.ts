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

async function orgWithRoles() {
  const admin = await createUser("aadmin");
  const member = await createUser("amem");
  users.push(admin.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Act ${admin.id.slice(0, 8)}` });
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
      email: `pat-${ownerId.slice(0, 8)}@act.test`,
      companyId: company.id,
      ownerId,
    },
  });
  const pipeline = await prisma.pipeline.findFirstOrThrow({
    where: { organizationId },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const deal = await prisma.deal.create({
    data: {
      organizationId,
      name: "Enterprise",
      companyId: company.id,
      primaryContactId: contact.id,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0]!.id,
      ownerId,
    },
  });
  return { company, contact, deal, pipeline };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("activities", () => {
  it("creates an activity with the authenticated author and tenant", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const res = await request(app)
      .post("/api/v1/activities")
      .set(auth(ctx.admin.token))
      .send({
        type: "CALL",
        content: "Called Rahul about pricing.",
        dealId: seed.deal.id,
        contactId: seed.contact.id,
        companyId: seed.company.id,
        occurredAt: "2026-09-19T10:30:00Z",
        metadata: { durationMinutes: 25 },
        authorId: ctx.member.id,
      });
    expect(res.status).toBe(400);

    const created = await request(app)
      .post("/api/v1/activities")
      .set(auth(ctx.admin.token))
      .send({
        type: "CALL",
        content: "Called Rahul about pricing.",
        dealId: seed.deal.id,
        contactId: seed.contact.id,
        companyId: seed.company.id,
        occurredAt: "2026-09-19T10:30:00Z",
        metadata: { durationMinutes: 25 },
      });
    expect(created.status).toBe(201);
    expect(created.body.data.authorId).toBe(ctx.admin.id);
    expect(created.body.data.organizationId).toBe(ctx.organizationId);
    expect(new Date(created.body.data.occurredAt).toISOString()).toBe("2026-09-19T10:30:00.000Z");
  });

  it("rejects foreign and incompatible relations", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const local = await seedDeal(a.organizationId, a.admin.id);
    const foreign = await seedDeal(b.organizationId, b.admin.id);
    const otherCompany = await prisma.company.create({
      data: { organizationId: a.organizationId, name: "Other", ownerId: a.admin.id },
    });

    const cross = await request(app)
      .post("/api/v1/activities")
      .set(auth(a.admin.token))
      .send({ type: "NOTE", content: "Nope", dealId: foreign.deal.id });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe("CROSS_TENANT_RELATION");

    const mismatch = await request(app)
      .post("/api/v1/activities")
      .set(auth(a.admin.token))
      .send({ type: "NOTE", content: "Nope", dealId: local.deal.id, companyId: otherCompany.id });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe("INVALID_ACTIVITY_RELATION");
  });

  it("lists, updates, and deletes user activities but protects STATUS_CHANGE", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const note = await request(app)
      .post("/api/v1/activities")
      .set(auth(ctx.admin.token))
      .send({ type: "NOTE", content: "Customer requested a demo.", dealId: seed.deal.id });

    const listed = await request(app).get("/api/v1/activities?search=demo").set(auth(ctx.admin.token));
    expect(listed.status).toBe(200);
    expect(listed.body.data.items.length).toBeGreaterThan(0);
    expect(listed.body.data.pagination.limit).toBe(25);

    const patched = await request(app)
      .patch(`/api/v1/activities/${note.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ content: "Updated note", occurredAt: "2026-09-18T09:00:00Z" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.content).toBe("Updated note");

    const negotiation = seed.pipeline.stages.find((s) => s.name === "Negotiation")!;
    const moved = await request(app)
      .post(`/api/v1/deals/${seed.deal.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: negotiation.id });
    expect(moved.status).toBe(200);
    const status = await prisma.activity.findFirstOrThrow({
      where: { dealId: seed.deal.id, type: "STATUS_CHANGE" },
    });
    expect((status.metadata as { fromStageName?: string }).fromStageName).toBe("Lead");
    expect((status.metadata as { toStageName?: string }).toStageName).toBe("Negotiation");

    const blocked = await request(app)
      .patch(`/api/v1/activities/${status.id}`)
      .set(auth(ctx.admin.token))
      .send({ content: "rewrite history" });
    expect(blocked.status).toBe(403);

    const deleted = await request(app).delete(`/api/v1/activities/${note.body.data.id}`).set(auth(ctx.admin.token));
    expect(deleted.status).toBe(200);
  });

  it("blocks cross-tenant IDOR and MEMBER delete", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const seed = await seedDeal(b.organizationId, b.admin.id);
    const activity = await request(app)
      .post("/api/v1/activities")
      .set(auth(b.admin.token))
      .send({ type: "EMAIL", content: "Sent proposal", dealId: seed.deal.id });

    const read = await request(app).get(`/api/v1/activities/${activity.body.data.id}`).set(auth(a.admin.token));
    expect(read.status).toBe(404);

    const own = await seedDeal(a.organizationId, a.member.id);
    const memberNote = await request(app)
      .post("/api/v1/activities")
      .set(auth(a.member.token))
      .send({ type: "NOTE", content: "Mine", dealId: own.deal.id });
    expect(memberNote.status).toBe(201);
    const denied = await request(app)
      .delete(`/api/v1/activities/${memberNote.body.data.id}`)
      .set(auth(a.member.token));
    expect(denied.status).toBe(403);
  });

  it("records won, lost, and reopen status-change activities without duplicates", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const won = seed.pipeline.stages.find((stage) => stage.isWon)!;
    const lost = seed.pipeline.stages.find((stage) => stage.isLost)!;
    const proposal = seed.pipeline.stages.find((stage) => stage.name === "Proposal")!;

    const first = await request(app).post(`/api/v1/deals/${seed.deal.id}/stage`).set(auth(ctx.admin.token)).send({ stageId: won.id });
    expect(first.status).toBe(200);
    const again = await request(app).post(`/api/v1/deals/${seed.deal.id}/stage`).set(auth(ctx.admin.token)).send({ stageId: won.id });
    expect(again.status).toBe(200);
    expect(await prisma.activity.count({ where: { dealId: seed.deal.id, type: "STATUS_CHANGE" } })).toBe(1);

    const reopened = await request(app)
      .post(`/api/v1/deals/${seed.deal.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: proposal.id });
    expect(reopened.status).toBe(200);
    const lostMove = await request(app)
      .post(`/api/v1/deals/${seed.deal.id}/stage`)
      .set(auth(ctx.admin.token))
      .send({ stageId: lost.id, lostReason: "PRICE" });
    expect(lostMove.status).toBe(200);

    const activities = await prisma.activity.findMany({
      where: { dealId: seed.deal.id, type: "STATUS_CHANGE" },
      orderBy: { createdAt: "asc" },
    });
    expect(activities).toHaveLength(3);
    expect((activities[0]!.metadata as { toStageName?: string }).toStageName).toBe("Won");
    expect((activities[1]!.metadata as { fromStageName?: string }).fromStageName).toBe("Won");
    expect((activities[2]!.metadata as { toStageName?: string }).toStageName).toBe("Lost");
  });

  it("creates a follow-up task in the same operation", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const res = await request(app)
      .post("/api/v1/activities")
      .set(auth(ctx.admin.token))
      .send({
        type: "CALL",
        content: "Called customer.",
        dealId: seed.deal.id,
        followUp: { title: "Send proposal", dueDate: "2026-09-25T12:00:00Z" },
      });
    expect(res.status).toBe(201);
    expect(res.body.data.followUpTask.title).toBe("Send proposal");
    expect(res.body.data.followUpTask.dealId).toBe(seed.deal.id);
  });
});

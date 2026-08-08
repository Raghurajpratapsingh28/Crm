import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { addMember, app, cleanupOrganization, cleanupUser, createUser } from "../../test/helpers.js";
import { sweepTaskReminders } from "./task-reminders.service.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

async function orgWithRoles() {
  const admin = await createUser("tadmin");
  const member = await createUser("tmem");
  users.push(admin.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Task ${admin.id.slice(0, 8)}` });
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
      email: `pat-${ownerId.slice(0, 8)}@task.test`,
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
  return { company, contact, deal };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("tasks", () => {
  it("creates, completes, reopens, and assigns tasks", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedDeal(ctx.organizationId, ctx.admin.id);
    const created = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({
        title: "Send revised proposal",
        description: "Update pricing",
        dueDate: "2026-09-25T12:00:00Z",
        dealId: seed.deal.id,
        companyId: seed.company.id,
        contactId: seed.contact.id,
        assigneeId: ctx.member.id,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.createdById).toBe(ctx.admin.id);
    expect(created.body.data.assigneeId).toBe(ctx.member.id);
    expect(created.body.data.isOverdue).toBe(false);

    const done = await request(app).post(`/api/v1/tasks/${created.body.data.id}/complete`).set(auth(ctx.admin.token));
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe("DONE");
    expect(done.body.data.completedAt).toBeTruthy();
    const again = await request(app).post(`/api/v1/tasks/${created.body.data.id}/complete`).set(auth(ctx.admin.token));
    expect(again.body.data.completedAt).toBe(done.body.data.completedAt);

    const reopened = await request(app).post(`/api/v1/tasks/${created.body.data.id}/reopen`).set(auth(ctx.admin.token));
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.status).toBe("OPEN");
    expect(reopened.body.data.completedAt).toBeNull();
    expect(reopened.body.data.dueDate).toBe(created.body.data.dueDate);
  });

  it("marks overdue only for open past-due tasks and filters in SQL", async () => {
    const ctx = await orgWithRoles();
    const past = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({ title: "Overdue", dueDate: "2020-01-01T00:00:00Z" });
    const future = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({ title: "Later", dueDate: "2099-01-01T00:00:00Z" });
    expect(past.body.data.isOverdue).toBe(true);
    expect(future.body.data.isOverdue).toBe(false);

    await request(app).post(`/api/v1/tasks/${past.body.data.id}/complete`).set(auth(ctx.admin.token));
    const completed = await request(app).get(`/api/v1/tasks/${past.body.data.id}`).set(auth(ctx.admin.token));
    expect(completed.body.data.isOverdue).toBe(false);

    const filtered = await request(app).get("/api/v1/tasks?overdue=true").set(auth(ctx.admin.token));
    expect(filtered.body.data.items.some((row: { id: string }) => row.id === future.body.data.id)).toBe(false);
  });

  it("rejects foreign assignees and deal/company mismatches", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const local = await seedDeal(a.organizationId, a.admin.id);
    const foreign = await seedDeal(b.organizationId, b.admin.id);
    const otherCompany = await prisma.company.create({
      data: { organizationId: a.organizationId, name: "Other", ownerId: a.admin.id },
    });

    const assignee = await request(app)
      .post("/api/v1/tasks")
      .set(auth(a.admin.token))
      .send({ title: "Bad assignee", assigneeId: b.admin.id });
    expect(assignee.status).toBe(400);
    expect(assignee.body.error.code).toBe("INVALID_TASK_ASSIGNEE");

    const deal = await request(app)
      .post("/api/v1/tasks")
      .set(auth(a.admin.token))
      .send({ title: "Bad deal", dealId: foreign.deal.id });
    expect(deal.status).toBe(400);

    const mismatch = await request(app)
      .post("/api/v1/tasks")
      .set(auth(a.admin.token))
      .send({ title: "Mismatch", dealId: local.deal.id, companyId: otherCompany.id });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe("INVALID_TASK_RELATION");
  });

  it("enforces IDOR and MEMBER assignment limits", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const foreign = await request(app).post("/api/v1/tasks").set(auth(b.admin.token)).send({ title: "Secret" });
    expect((await request(app).get(`/api/v1/tasks/${foreign.body.data.id}`).set(auth(a.admin.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/tasks/${foreign.body.data.id}/complete`).set(auth(a.admin.token))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/tasks/${foreign.body.data.id}`).set(auth(a.admin.token))).status).toBe(404);

    const own = await request(app).post("/api/v1/tasks").set(auth(a.member.token)).send({ title: "Mine" });
    const assign = await request(app)
      .post(`/api/v1/tasks/${own.body.data.id}/assign`)
      .set(auth(a.member.token))
      .send({ assigneeId: a.admin.id });
    expect(assign.status).toBe(403);
    const deleted = await request(app).delete(`/api/v1/tasks/${own.body.data.id}`).set(auth(a.member.token));
    expect(deleted.status).toBe(403);
  });

  it("keeps concurrent completions consistent", async () => {
    const ctx = await orgWithRoles();
    const created = await request(app).post("/api/v1/tasks").set(auth(ctx.admin.token)).send({ title: "Race" });
    const [first, second] = await Promise.all([
      request(app).post(`/api/v1/tasks/${created.body.data.id}/complete`).set(auth(ctx.admin.token)),
      request(app).post(`/api/v1/tasks/${created.body.data.id}/complete`).set(auth(ctx.admin.token)),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.completedAt).toBe(second.body.data.completedAt);
    const audits = await prisma.auditLog.count({ where: { entityId: created.body.data.id, action: "TASK_COMPLETED" } });
    expect(audits).toBe(1);
  });

  it("sends reminder and overdue notifications only once", async () => {
    const ctx = await orgWithRoles();
    const soon = new Date(Date.now() + 60 * 60 * 1000);
    const past = new Date(Date.now() - 60 * 60 * 1000);
    await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({ title: "Due soon", dueDate: soon.toISOString(), assigneeId: ctx.member.id });
    await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({ title: "Already late", dueDate: past.toISOString(), assigneeId: ctx.member.id });

    const first = await sweepTaskReminders(new Date(), 24);
    const second = await sweepTaskReminders(new Date(), 24);
    expect(first.reminders + first.overdues).toBeGreaterThan(0);
    expect(second.reminders).toBe(0);
    expect(second.overdues).toBe(0);
    const reminders = await prisma.notification.count({
      where: { organizationId: ctx.organizationId, type: { in: ["TASK_REMINDER", "FOLLOW_UP_OVERDUE"] } },
    });
    expect(reminders).toBe(first.reminders + first.overdues);
  });

  it("enqueues TASK_ASSIGNED for another user and skips self-assignment", async () => {
    const ctx = await orgWithRoles();
    const created = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({ title: "Send revised proposal", assigneeId: ctx.member.id });
    expect(created.status).toBe(201);
    const jobs = await prisma.job.findMany({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
    });
    expect(jobs.some((job) => JSON.stringify(job.payload).includes("TASK_ASSIGNED"))).toBe(true);
    expect(jobs.some((job) => JSON.stringify(job.payload).includes(created.body.data.id))).toBe(true);

    await prisma.job.deleteMany({ where: { organizationId: ctx.organizationId, type: "notification.fanout" } });
    const self = await request(app)
      .post("/api/v1/tasks")
      .set(auth(ctx.admin.token))
      .send({ title: "My own task", assigneeId: ctx.admin.id });
    expect(self.status).toBe(201);
    const selfJobs = await prisma.job.count({
      where: { organizationId: ctx.organizationId, type: "notification.fanout" },
    });
    expect(selfJobs).toBe(0);
  });
});

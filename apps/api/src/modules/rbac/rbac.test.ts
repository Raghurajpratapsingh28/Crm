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
  const admin = await createUser("admin");
  const manager = await createUser("mgr");
  const member = await createUser("mem");
  users.push(admin.id, manager.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `RBAC ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  const organizationId = created.body.data.id as string;
  await addMember(organizationId, manager, "MANAGER");
  await addMember(organizationId, member, "MEMBER");
  return { admin, manager, member, organizationId };
}

async function seedCrm(organizationId: string, ownerId: string) {
  const company = await prisma.company.create({
    data: { organizationId, name: "Acme", ownerId },
  });
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      firstName: "Pat",
      lastName: "Owner",
      email: `pat-${ownerId.slice(0, 8)}@a.test`,
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
      name: "Owned deal",
      companyId: company.id,
      primaryContactId: contact.id,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0]!.id,
      ownerId,
    },
  });
  const task = await prisma.task.create({
    data: { organizationId, title: "Owned task", assigneeId: ownerId, createdById: ownerId },
  });
  const activity = await prisma.activity.create({
    data: { organizationId, type: "NOTE", authorId: ownerId, content: "hello", dealId: deal.id },
  });
  return { company, contact, deal, task, activity, pipeline };
}

describe("ADMIN", () => {
  it("can update the organization, manage billing, and read audit logs", async () => {
    const ctx = await orgWithRoles();
    const org = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ name: "Admin Org" });
    expect(org.status).toBe(200);

    const billing = await request(app)
      .post("/api/v1/billing/checkout")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ provider: "STRIPE" });
    expect(billing.status).toBe(201);

    const audit = await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(audit.status).toBe(200);
    expect(audit.body.data.some((row: { action: string }) => row.action === "BILLING_CHANGED")).toBe(true);
  });

  it("can invite, change roles, and deactivate without removing the last admin", async () => {
    const ctx = await orgWithRoles();
    const invitee = await createUser("invitee");
    users.push(invitee.id);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${invitee.token}`);

    const invited = await request(app)
      .post("/api/v1/team")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: invitee.email, role: "MEMBER" });
    expect(invited.status).toBe(201);

    const memberRow = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, userId: ctx.member.id },
    });
    const roleChange = await request(app)
      .patch(`/api/v1/team/${memberRow.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ role: "MANAGER" });
    expect(roleChange.status).toBe(200);

    const self = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, userId: ctx.admin.id },
    });
    const selfRole = await request(app)
      .patch(`/api/v1/team/${self.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ role: "MEMBER" });
    expect(selfRole.status).toBe(403);

    const deactivated = await request(app)
      .delete(`/api/v1/team/${memberRow.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.status).toBe("DEACTIVATED");

    const logs = await prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId } });
    expect(logs.some((row) => row.action === "USER_INVITED")).toBe(true);
    expect(logs.some((row) => row.action === "USER_ROLE_CHANGED")).toBe(true);
    expect(logs.some((row) => row.action === "USER_DEACTIVATED")).toBe(true);
  });
});

describe("MANAGER", () => {
  it("can work CRM records and assign deals, but cannot manage org, users, pipeline, or billing", async () => {
    const ctx = await orgWithRoles();
    const seed = await seedCrm(ctx.organizationId, ctx.manager.id);

    const contact = await request(app)
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ firstName: "Mgr", lastName: "Contact" });
    expect(contact.status).toBe(201);

    const assigned = await request(app)
      .post(`/api/v1/deals/${seed.deal.id}/assign`)
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ ownerId: ctx.member.id });
    expect(assigned.status).toBe(200);

    const analytics = await request(app)
      .get("/api/v1/analytics/team")
      .set("Authorization", `Bearer ${ctx.manager.token}`);
    expect(analytics.status).toBe(200);

    const org = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ name: "Nope" });
    expect(org.status).toBe(403);

    const invite = await request(app)
      .post("/api/v1/team")
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ email: ctx.member.email });
    expect(invite.status).toBe(403);

    const pipeline = await request(app)
      .patch(`/api/v1/pipelines/${seed.pipeline.id}`)
      .set("Authorization", `Bearer ${ctx.manager.token}`)
      .send({ name: "Hijack" });
    expect(pipeline.status).toBe(403);

    const billing = await request(app)
      .get("/api/v1/billing")
      .set("Authorization", `Bearer ${ctx.manager.token}`);
    expect(billing.status).toBe(403);
  });
});

describe("MEMBER", () => {
  it("can mutate owned records and is blocked from privileged actions", async () => {
    const ctx = await orgWithRoles();
    const own = await seedCrm(ctx.organizationId, ctx.member.id);
    const other = await seedCrm(ctx.organizationId, ctx.admin.id);

    const created = await request(app)
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ firstName: "Mem", lastName: "Own" });
    expect(created.status).toBe(201);

    const updateOwn = await request(app)
      .patch(`/api/v1/contacts/${own.contact.id}`)
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ firstName: "Updated" });
    expect(updateOwn.status).toBe(200);

    const updateOther = await request(app)
      .patch(`/api/v1/contacts/${other.contact.id}`)
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ firstName: "Steal" });
    expect(updateOther.status).toBe(404);

    const deleteOwn = await request(app)
      .delete(`/api/v1/contacts/${own.contact.id}`)
      .set("Authorization", `Bearer ${ctx.member.token}`);
    expect(deleteOwn.status).toBe(403);

    const assign = await request(app)
      .post(`/api/v1/deals/${own.deal.id}/assign`)
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ ownerId: ctx.admin.id });
    expect(assign.status).toBe(403);

    const teamAnalytics = await request(app)
      .get("/api/v1/analytics/team")
      .set("Authorization", `Bearer ${ctx.member.token}`);
    expect(teamAnalytics.status).toBe(403);

    const audit = await request(app)
      .get("/api/v1/audit")
      .set("Authorization", `Bearer ${ctx.member.token}`);
    expect(audit.status).toBe(403);

    const task = await request(app)
      .post("/api/v1/tasks")
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ title: "My task" });
    expect(task.status).toBe(201);
    const taskUpdate = await request(app)
      .patch(`/api/v1/tasks/${task.body.data.id}`)
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ status: "DONE" });
    expect(taskUpdate.status).toBe(200);
  });

  it("cannot escalate role or spoof ownership fields", async () => {
    const ctx = await orgWithRoles();
    const own = await seedCrm(ctx.organizationId, ctx.member.id);
    const memberRow = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, userId: ctx.member.id },
    });

    const role = await request(app)
      .patch(`/api/v1/team/${memberRow.id}`)
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ role: "ADMIN" });
    expect(role.status).toBe(403);

    const spoof = await request(app)
      .patch(`/api/v1/contacts/${own.contact.id}`)
      .set("Authorization", `Bearer ${ctx.member.token}`)
      .send({ owner_id: ctx.admin.id, organization_id: "00000000-0000-4000-8000-000000000099", role: "ADMIN" });
    expect(spoof.status).toBe(400);

    const after = await prisma.contact.findUniqueOrThrow({ where: { id: own.contact.id } });
    expect(after.ownerId).toBe(ctx.member.id);
    expect(after.organizationId).toBe(ctx.organizationId);
  });
});

describe("cross-tenant IDOR", () => {
  it("hides org B records from every org A role", async () => {
    const a = await orgWithRoles();
    const adminB = await createUser("adminb");
    users.push(adminB.id);
    const orgB = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${adminB.token}`)
      .send({ name: `B ${adminB.id.slice(0, 8)}` });
    orgs.push(orgB.body.data.id);
    const seedB = await seedCrm(orgB.body.data.id, adminB.id);
    await prisma.notification.create({
      data: {
        organizationId: orgB.body.data.id,
        userId: adminB.id,
        type: "LEAD_ASSIGNED",
        payload: { dealId: seedB.deal.id },
      },
    });

    const tokens = [a.admin.token, a.manager.token, a.member.token];
    for (const token of tokens) {
      const headers = { Authorization: `Bearer ${token}` };
      expect((await request(app).get(`/api/v1/contacts/${seedB.contact.id}`).set(headers)).status).toBe(404);
      expect((await request(app).get(`/api/v1/companies/${seedB.company.id}`).set(headers)).status).toBe(404);
      expect((await request(app).get(`/api/v1/deals/${seedB.deal.id}`).set(headers)).status).toBe(404);
      expect((await request(app).patch(`/api/v1/deals/${seedB.deal.id}`).set(headers).send({ name: "x" })).status).toBe(404);
      expect([403, 404]).toContain((await request(app).delete(`/api/v1/deals/${seedB.deal.id}`).set(headers)).status);
      expect((await request(app).get(`/api/v1/tasks/${seedB.task.id}`).set(headers)).status).toBe(404);
      expect((await request(app).get(`/api/v1/activities/${seedB.activity.id}`).set(headers)).status).toBe(404);
      expect((await request(app).get(`/api/v1/pipelines`).set(headers)).status).toBe(200);
      expect(
        ((await request(app).get(`/api/v1/pipelines`).set(headers)).body.data as { id: string }[]).some(
          (row) => row.id === seedB.pipeline.id,
        ),
      ).toBe(false);
    }

    const adminDelete = await request(app)
      .delete(`/api/v1/deals/${seedB.deal.id}`)
      .set("Authorization", `Bearer ${a.admin.token}`);
    expect(adminDelete.status).toBe(404);
    const memberDelete = await request(app)
      .delete(`/api/v1/deals/${seedB.deal.id}`)
      .set("Authorization", `Bearer ${a.member.token}`);
    expect(memberDelete.status).toBe(403);
  });
});

describe("audit authorization", () => {
  it("lets ADMIN and MANAGER read logs and blocks MEMBER", async () => {
    const ctx = await orgWithRoles();
    const adminRead = await request(app).get("/api/v1/audit").set("Authorization", `Bearer ${ctx.admin.token}`);
    const managerRead = await request(app).get("/api/v1/audit").set("Authorization", `Bearer ${ctx.manager.token}`);
    const memberRead = await request(app).get("/api/v1/audit").set("Authorization", `Bearer ${ctx.member.token}`);
    expect(adminRead.status).toBe(200);
    expect(managerRead.status).toBe(200);
    expect(memberRead.status).toBe(403);
  });
});

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
  const admin = await createUser("nadmin");
  const member = await createUser("nmem");
  users.push(admin.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Note ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  await addMember(created.body.data.id, member, "MEMBER");
  return { admin, member, organizationId: created.body.data.id as string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedNotification(
  organizationId: string,
  userId: string,
  extra: { type?: "TASK_ASSIGNED" | "DEAL_WON"; readAt?: Date | null; title?: string } = {},
) {
  return prisma.notification.create({
    data: {
      organizationId,
      userId,
      type: extra.type ?? "TASK_ASSIGNED",
      title: extra.title ?? "New task assigned",
      message: "A task was assigned to you.",
      entityType: extra.type === "DEAL_WON" ? "DEAL" : "TASK",
      entityId: extra.type === "DEAL_WON" ? "11111111-1111-4111-8111-111111111111" : "22222222-2222-4222-8222-222222222222",
      payload: extra.type === "DEAL_WON" ? { dealId: "11111111-1111-4111-8111-111111111111", name: "Acme" } : { taskId: "22222222-2222-4222-8222-222222222222", title: "Call" },
      readAt: extra.readAt,
    },
  });
}

describe("notifications API", () => {
  it("lists only the recipient's tenant-scoped notifications and paginates", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    await seedNotification(a.organizationId, a.member.id, { title: "Member note" });
    await seedNotification(a.organizationId, a.admin.id, { title: "Admin note" });
    await seedNotification(b.organizationId, b.member.id, { title: "Org B" });

    const list = await request(app).get("/api/v1/notifications?limit=25").set(auth(a.member.token));
    expect(list.status).toBe(200);
    expect(list.body.data.items.every((row: { title: string }) => row.title !== "Org B")).toBe(true);
    expect(list.body.data.items.every((row: { title: string }) => row.title !== "Admin note")).toBe(true);
    expect(list.body.data.items.some((row: { title: string }) => row.title === "Member note")).toBe(true);
    expect(list.body.data.pagination.limit).toBe(25);

    const foreign = await request(app).get("/api/v1/notifications").set(auth(b.admin.token));
    expect(foreign.body.data.items.some((row: { title: string }) => row.title === "Member note")).toBe(false);
  });

  it("filters unread, returns unread count, and marks read idempotently", async () => {
    const ctx = await orgWithRoles();
    const unread = await seedNotification(ctx.organizationId, ctx.member.id);
    await seedNotification(ctx.organizationId, ctx.member.id, { readAt: new Date(), title: "Already read" });

    const count = await request(app).get("/api/v1/notifications/unread-count").set(auth(ctx.member.token));
    expect(count.status).toBe(200);
    expect(count.body.data.count).toBe(1);

    const unreadList = await request(app).get("/api/v1/notifications?unread=true").set(auth(ctx.member.token));
    expect(unreadList.body.data.items).toHaveLength(1);
    expect(unreadList.body.data.items[0].id).toBe(unread.id);
    expect(unreadList.body.data.items[0].href).toBe(`/tasks/${unread.entityId}`);

    const read = await request(app).patch(`/api/v1/notifications/${unread.id}/read`).set(auth(ctx.member.token));
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();
    const again = await request(app).patch(`/api/v1/notifications/${unread.id}/read`).set(auth(ctx.member.token));
    expect(again.status).toBe(200);
    expect(again.body.data.readAt).toBe(read.body.data.readAt);

    const after = await request(app).get("/api/v1/notifications/unread-count").set(auth(ctx.member.token));
    expect(after.body.data.count).toBe(0);
  });

  it("marks all unread for the current user only", async () => {
    const ctx = await orgWithRoles();
    await seedNotification(ctx.organizationId, ctx.member.id);
    await seedNotification(ctx.organizationId, ctx.member.id);
    await seedNotification(ctx.organizationId, ctx.admin.id);
    const result = await request(app).patch("/api/v1/notifications/read-all").set(auth(ctx.member.token));
    expect(result.status).toBe(200);
    expect(result.body.data.updated).toBe(2);
    expect(await prisma.notification.count({ where: { userId: ctx.admin.id, readAt: null } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ctx.member.id, readAt: null } })).toBe(0);
  });

  it("blocks IDOR across tenants and recipients", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const other = await seedNotification(b.organizationId, b.member.id);
    const teammate = await seedNotification(a.organizationId, a.admin.id);

    expect((await request(app).get(`/api/v1/notifications/${other.id}`).set(auth(a.member.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/notifications/${other.id}/read`).set(auth(a.member.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/notifications/${teammate.id}`).set(auth(a.member.token))).status).toBe(404);
    expect((await request(app).patch(`/api/v1/notifications/${teammate.id}/read`).set(auth(a.member.token))).status).toBe(404);
    expect((await request(app).patch("/api/v1/notifications/read-all").set(auth(a.member.token))).status).toBe(200);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ readAt: null });
  });

  it("deep-links deal notifications", async () => {
    const ctx = await orgWithRoles();
    const won = await seedNotification(ctx.organizationId, ctx.member.id, { type: "DEAL_WON", title: "Deal won" });
    const detail = await request(app).get(`/api/v1/notifications/${won.id}`).set(auth(ctx.member.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.href).toBe(`/deals/${won.entityId}`);
  });
});

import { createHash } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createInvitationToken, hashInvitationToken, invitationHashesEqual } from "../../lib/invitation-token.js";
import { prisma } from "../../lib/prisma.js";
import { addMember, app, cleanupOrganization, cleanupUser, createUser, ensureUser } from "../../test/helpers.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

async function createOrg(prefix: string) {
  const admin = await createUser(prefix);
  users.push(admin.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `${prefix} ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  return { admin, organizationId: created.body.data.id as string };
}

describe("invitation tokens", () => {
  it("stores only a hash and compares in constant time", () => {
    const token = createInvitationToken();
    expect(token.raw).not.toContain(token.hash);
    expect(hashInvitationToken(token.raw)).toBe(token.hash);
    expect(invitationHashesEqual(token.hash, createHash("sha256").update(token.raw).digest("hex"))).toBe(true);
    expect(invitationHashesEqual(token.hash, hashInvitationToken("other"))).toBe(false);
  });
});

describe("organization authorization", () => {
  it("lets ADMIN update the organization and blocks MANAGER and MEMBER", async () => {
    const ctx = await createOrg("orgauth");
    const manager = await createUser("mgr");
    const member = await createUser("mem");
    users.push(manager.id, member.id);
    await addMember(ctx.organizationId, manager, "MANAGER");
    await addMember(ctx.organizationId, member, "MEMBER");

    const ok = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ name: "Renamed", timezone: "UTC", currency: "USD" });
    expect(ok.status).toBe(200);

    const managerDenied = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${manager.token}`)
      .send({ name: "Nope" });
    expect(managerDenied.status).toBe(403);

    const memberDenied = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ name: "Nope" });
    expect(memberDenied.status).toBe(403);
  });
});

describe("team listing", () => {
  it("lists tenant members for ADMIN/MANAGER and hides org B", async () => {
    const a = await createOrg("teama");
    const b = await createOrg("teamb");
    const manager = await createUser("listmgr");
    const member = await createUser("listmem");
    users.push(manager.id, member.id);
    await addMember(a.organizationId, manager, "MANAGER");
    await addMember(a.organizationId, member, "MEMBER");

    const adminList = await request(app).get("/api/v1/team?search=list&role=MEMBER").set("Authorization", `Bearer ${a.admin.token}`);
    expect(adminList.status).toBe(200);
    expect(adminList.body.data.items.some((row: { userId: string }) => row.userId === member.id)).toBe(true);
    expect(adminList.body.data.items.some((row: { userId: string }) => row.userId === b.admin.id)).toBe(false);

    const managerList = await request(app).get("/api/v1/team").set("Authorization", `Bearer ${manager.token}`);
    expect(managerList.status).toBe(200);

    const memberList = await request(app).get("/api/v1/team").set("Authorization", `Bearer ${member.token}`);
    expect(memberList.status).toBe(403);

    const foreign = await request(app).get(`/api/v1/team/${(await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: b.organizationId } })).id}`).set("Authorization", `Bearer ${a.admin.token}`);
    expect(foreign.status).toBe(404);
  });
});

describe("invitations", () => {
  it("creates a hashed invitation, enqueues email, and accepts for an existing user", async () => {
    const ctx = await createOrg("inviteok");
    const invitee = await createUser("joinme");
    users.push(invitee.id);
    await ensureUser(invitee);

    const created = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: invitee.email, role: "MEMBER", department: "SALES" });
    expect(created.status).toBe(201);

    const stored = await prisma.organizationInvitation.findUniqueOrThrow({ where: { id: created.body.data.id } });
    expect(stored.tokenHash).toHaveLength(64);
    expect(JSON.stringify(stored)).not.toContain("acceptUrl");

    const job = await prisma.job.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, type: "email.invite" },
      orderBy: { createdAt: "desc" },
    });
    const payload = job.payload as { acceptUrl: string };
    const token = payload.acceptUrl.split("/invitations/")[1]!;
    expect(hashInvitationToken(token)).toBe(stored.tokenHash);

    const preview = await request(app).get(`/api/v1/team/invitations/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.data.status).toBe("VALID");
    expect(preview.body.data).not.toHaveProperty("tokenHash");

    const accepted = await request(app)
      .post(`/api/v1/team/invitations/${token}/accept`)
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(accepted.status).toBe(200);

    const membership = await prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: ctx.organizationId, userId: invitee.id } },
    });
    expect(membership.status).toBe("ACTIVE");
    expect(membership.department).toBe("SALES");

    const replay = await request(app)
      .post(`/api/v1/team/invitations/${token}/accept`)
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe("INVITATION_ALREADY_ACCEPTED");
  });

  it("rotates the token on resend so the old link cannot be accepted", async () => {
    const ctx = await createOrg("resend");
    const invitee = await createUser("resendee");
    users.push(invitee.id);
    await ensureUser(invitee);
    const created = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: invitee.email });
    const firstJob = await prisma.job.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, type: "email.invite" },
      orderBy: { createdAt: "desc" },
    });
    const oldToken = (firstJob.payload as { acceptUrl: string }).acceptUrl.split("/invitations/")[1]!;

    await prisma.organizationInvitation.update({
      where: { id: created.body.data.id },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });
    const resent = await request(app)
      .post(`/api/v1/team/invitations/${created.body.data.id}/resend`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(resent.status).toBe(200);

    const tooSoon = await request(app)
      .post(`/api/v1/team/invitations/${created.body.data.id}/resend`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(tooSoon.status).toBe(429);

    const dead = await request(app)
      .post(`/api/v1/team/invitations/${oldToken}/accept`)
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(dead.status).toBe(404);

    const newJob = await prisma.job.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, type: "email.invite" },
      orderBy: { createdAt: "desc" },
    });
    const newToken = (newJob.payload as { acceptUrl: string }).acceptUrl.split("/invitations/")[1]!;
    const accepted = await request(app)
      .post(`/api/v1/team/invitations/${newToken}/accept`)
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(accepted.status).toBe(200);
  });

  it("rejects duplicate members, duplicate pending invites, email mismatch, expired and cancelled tokens", async () => {
    const ctx = await createOrg("invitebad");
    const member = await createUser("dupmem");
    const stranger = await createUser("stranger");
    users.push(member.id, stranger.id);
    await addMember(ctx.organizationId, member, "MEMBER");

    const duplicateMember = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: member.email });
    expect(duplicateMember.status).toBe(409);
    expect(duplicateMember.body.error.code).toBe("MEMBER_ALREADY_EXISTS");

    const invitee = await createUser("pending");
    users.push(invitee.id);
    const first = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: invitee.email });
    expect(first.status).toBe(201);
    const second = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: invitee.email });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("INVITATION_ALREADY_EXISTS");

    const job = await prisma.job.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, type: "email.invite" },
      orderBy: { createdAt: "desc" },
    });
    const token = (job.payload as { acceptUrl: string }).acceptUrl.split("/invitations/")[1]!;

    await ensureUser(stranger);
    const mismatch = await request(app)
      .post(`/api/v1/team/invitations/${token}/accept`)
      .set("Authorization", `Bearer ${stranger.token}`);
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error.code).toBe("EMAIL_MISMATCH");

    const invalid = await request(app)
      .post("/api/v1/team/invitations/not-a-real-token-value-at-all/accept")
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(invalid.status).toBe(404);
    expect(invalid.body.error.code).toBe("INVALID_INVITATION");

    await prisma.organizationInvitation.update({
      where: { id: first.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const expired = await request(app)
      .post(`/api/v1/team/invitations/${token}/accept`)
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe("INVITATION_EXPIRED");

    const other = await createUser("cancelme");
    users.push(other.id);
    const cancellable = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: other.email });
    const cancel = await request(app)
      .post(`/api/v1/team/invitations/${cancellable.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(cancel.status).toBe(200);
    const cancelledJob = await prisma.job.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, type: "email.invite" },
      orderBy: { createdAt: "desc" },
    });
    const cancelledToken = (cancelledJob.payload as { acceptUrl: string }).acceptUrl.split("/invitations/")[1]!;
    await ensureUser(other);
    const cancelledAccept = await request(app)
      .post(`/api/v1/team/invitations/${cancelledToken}/accept`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(cancelledAccept.status).toBe(410);
    expect(cancelledAccept.body.error.code).toBe("INVITATION_CANCELLED");
  });
});

describe("roles and last admin", () => {
  it("lets ADMIN change roles and blocks MEMBER privilege escalation", async () => {
    const ctx = await createOrg("roles");
    const member = await createUser("rolemem");
    users.push(member.id);
    const row = await addMember(ctx.organizationId, member, "MEMBER");

    const promoted = await request(app)
      .patch(`/api/v1/team/${row.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ role: "MANAGER", department: "MARKETING" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe("MANAGER");

    const demoted = await request(app)
      .patch(`/api/v1/team/${row.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ role: "MEMBER" });
    expect(demoted.status).toBe(200);

    const escalate = await request(app)
      .patch(`/api/v1/team/${row.id}`)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ role: "ADMIN" });
    expect(escalate.status).toBe(403);

    const adminRow = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, userId: ctx.admin.id },
    });
    const lastAdmin = await request(app)
      .patch(`/api/v1/team/${adminRow.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ role: "MEMBER" });
    expect(lastAdmin.status).toBe(409);
    expect(lastAdmin.body.error.code).toBe("LAST_ADMIN_REQUIRED");

    const deactivateLast = await request(app)
      .post(`/api/v1/team/${adminRow.id}/deactivate`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(deactivateLast.status).toBe(409);
    expect(deactivateLast.body.error.code).toBe("LAST_ADMIN_REQUIRED");
  });
});

describe("deactivation lifecycle", () => {
  it("deactivates, blocks access, then reactivates", async () => {
    const ctx = await createOrg("life");
    const member = await createUser("lifemem");
    users.push(member.id);
    const row = await addMember(ctx.organizationId, member, "MEMBER");

    const before = await request(app).get("/api/v1/organizations/current").set("Authorization", `Bearer ${member.token}`);
    expect(before.status).toBe(200);

    const deactivated = await request(app)
      .post(`/api/v1/team/${row.id}/deactivate`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.status).toBe("DEACTIVATED");

    const blocked = await request(app).get("/api/v1/organizations/current").set("Authorization", `Bearer ${member.token}`);
    expect(blocked.status).toBe(403);

    const reactivated = await request(app)
      .post(`/api/v1/team/${row.id}/reactivate`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(reactivated.status).toBe(200);

    const after = await request(app).get("/api/v1/organizations/current").set("Authorization", `Bearer ${member.token}`);
    expect(after.status).toBe(200);
  });
});

describe("ownership transfer", () => {
  it("promotes the target and demotes the current admin atomically", async () => {
    const ctx = await createOrg("xfer");
    const member = await createUser("xfertgt");
    const other = await createOrg("xferb");
    users.push(member.id);
    const target = await addMember(ctx.organizationId, member, "MEMBER");
    const foreign = await prisma.organizationMember.findFirstOrThrow({ where: { organizationId: other.organizationId } });

    const denied = await request(app)
      .post("/api/v1/organizations/current/transfer-ownership")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ memberId: target.id });
    expect(denied.status).toBe(403);

    const cross = await request(app)
      .post("/api/v1/organizations/current/transfer-ownership")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ memberId: foreign.id });
    expect(cross.status).toBe(404);

    const transferred = await request(app)
      .post("/api/v1/organizations/current/transfer-ownership")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ memberId: target.id });
    expect(transferred.status).toBe(200);

    const rows = await prisma.organizationMember.findMany({ where: { organizationId: ctx.organizationId } });
    expect(rows.find((row) => row.userId === member.id)?.role).toBe("ADMIN");
    expect(rows.find((row) => row.userId === ctx.admin.id)?.role).toBe("MANAGER");
    expect(rows.filter((row) => row.role === "ADMIN" && row.status === "ACTIVE")).toHaveLength(1);
  });
});

describe("team integration", () => {
  it("covers invite, accept, role change, deactivate, and reactivate", async () => {
    const ctx = await createOrg("e2e");
    const invitee = await createUser("e2euser");
    users.push(invitee.id);
    await ensureUser(invitee);

    const invited = await request(app)
      .post("/api/v1/team/invitations")
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ email: invitee.email, role: "MEMBER" });
    expect(invited.status).toBe(201);
    const job = await prisma.job.findFirstOrThrow({
      where: { organizationId: ctx.organizationId, type: "email.invite" },
      orderBy: { createdAt: "desc" },
    });
    const token = (job.payload as { acceptUrl: string }).acceptUrl.split("/invitations/")[1]!;

    const accepted = await request(app)
      .post(`/api/v1/team/invitations/${token}/accept`)
      .set("Authorization", `Bearer ${invitee.token}`);
    expect(accepted.status).toBe(200);

    const list = await request(app).get("/api/v1/team").set("Authorization", `Bearer ${ctx.admin.token}`);
    const member = list.body.data.items.find((row: { userId: string }) => row.userId === invitee.id);
    expect(member.status).toBe("ACTIVE");

    const role = await request(app)
      .patch(`/api/v1/team/${member.id}`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .send({ role: "MANAGER" });
    expect(role.status).toBe(200);
    expect(
      (await prisma.auditLog.findMany({ where: { organizationId: ctx.organizationId } })).some(
        (row) => row.action === "USER_ROLE_CHANGED",
      ),
    ).toBe(true);

    const deactivated = await request(app)
      .post(`/api/v1/team/${member.id}/deactivate`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(deactivated.body.data.status).toBe("DEACTIVATED");
    expect((await request(app).get("/api/v1/organizations/current").set("Authorization", `Bearer ${invitee.token}`)).status).toBe(403);

    const reactivated = await request(app)
      .post(`/api/v1/team/${member.id}/reactivate`)
      .set("Authorization", `Bearer ${ctx.admin.token}`);
    expect(reactivated.body.data.status).toBe("ACTIVE");
    expect((await request(app).get("/api/v1/organizations/current").set("Authorization", `Bearer ${invitee.token}`)).status).toBe(200);
  });
});

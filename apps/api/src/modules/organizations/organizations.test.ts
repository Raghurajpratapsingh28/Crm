import { DEFAULT_PIPELINE_NAME, DEFAULT_PIPELINE_STAGES } from "@crm/types";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { cleanupOrganization, cleanupUser, createUser } from "../../test/helpers.js";
import { app } from "../../test/helpers.js";
import { createOrganizationForUser } from "./organization.service.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

describe("membership", () => {
  it("returns onboarding state when the user has no organization", async () => {
    const user = await createUser("noorg");
    users.push(user.id);
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.organization).toBeNull();

    const current = await request(app)
      .get("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${user.token}`);
    expect(current.status).toBe(403);
    expect(current.body.error.code).toBe("FORBIDDEN");
  });

  it("allows an active member to read the current organization", async () => {
    const user = await createUser("active");
    users.push(user.id);
    const created = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: `Org ${user.id.slice(0, 8)}` });
    orgs.push(created.body.data.id);
    const res = await request(app)
      .get("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data.membershipStatus).toBe("ACTIVE");
  });

  it("rejects a deactivated membership", async () => {
    const user = await createUser("inactive");
    users.push(user.id);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${user.token}`);
    const created = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: `Inactive ${user.id.slice(0, 8)}` });
    orgs.push(created.body.data.id);
    await prisma.organizationMember.updateMany({
      where: { userId: user.id },
      data: { status: "DEACTIVATED" },
    });
    const res = await request(app)
      .get("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(403);
  });
});

describe("organizations", () => {
  it("creates an organization with ADMIN membership and default pipeline stages", async () => {
    const user = await createUser("createorg");
    users.push(user.id);
    const res = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: `Acme ${user.id.slice(0, 8)}`, timezone: "Asia/Kolkata", currency: "INR" });
    expect(res.status).toBe(201);
    orgs.push(res.body.data.id);
    expect(res.body.data.role).toBe("ADMIN");

    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId: res.body.data.id },
    });
    expect(membership?.role).toBe("ADMIN");
    expect(membership?.status).toBe("ACTIVE");

    const pipeline = await prisma.pipeline.findFirst({
      where: { organizationId: res.body.data.id },
      include: { stages: { orderBy: { order: "asc" } } },
    });
    expect(pipeline?.name).toBe(DEFAULT_PIPELINE_NAME);
    expect(pipeline?.stages.map((stage) => stage.name)).toEqual(
      DEFAULT_PIPELINE_STAGES.map((stage) => stage.name),
    );
    expect(pipeline?.stages[6]?.isWon).toBe(true);
    expect(pipeline?.stages[7]?.isLost).toBe(true);
  });

  it("does not create a second organization on retry", async () => {
    const user = await createUser("retryorg");
    users.push(user.id);
    const first = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: `Once ${user.id.slice(0, 8)}` });
    orgs.push(first.body.data.id);
    const second = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "Should not create" });
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
    const count = await prisma.organization.count({
      where: { members: { some: { userId: user.id } } },
    });
    expect(count).toBe(1);
  });

  it("rolls back the transaction when a later step fails", async () => {
    const name = `Rollback ${crypto.randomUUID().slice(0, 8)}`;
    await expect(
      createOrganizationForUser("00000000-0000-4000-8000-000000000099", { name }),
    ).rejects.toThrow();
    const leftover = await prisma.organization.findFirst({ where: { name } });
    expect(leftover).toBeNull();
  });

  it("lets ADMIN patch the organization and blocks MEMBER", async () => {
    const admin = await createUser("padmin");
    const member = await createUser("pmember");
    users.push(admin.id, member.id);
    const created = await request(app)
      .post("/api/v1/organizations")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: `Patch ${admin.id.slice(0, 8)}` });
    orgs.push(created.body.data.id);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${member.token}`);
    await prisma.organizationMember.create({
      data: {
        organizationId: created.body.data.id,
        userId: member.id,
        role: "MEMBER",
        status: "ACTIVE",
      },
    });

    const patched = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${admin.token}`)
      .send({ name: "Renamed Org" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe("Renamed Org");

    const denied = await request(app)
      .patch("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${member.token}`)
      .send({ name: "Hijack" });
    expect(denied.status).toBe(403);
  });
});

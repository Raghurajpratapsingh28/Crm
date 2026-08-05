import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app, cleanupOrganization, cleanupUser, createUser } from "../../test/helpers.js";

const users: string[] = [];
const orgs: string[] = [];

afterAll(async () => {
  for (const id of orgs) await cleanupOrganization(id);
  for (const id of users) await cleanupUser(id);
  await prisma.$disconnect();
});

async function provision() {
  const userA = await createUser("tenanta");
  const userB = await createUser("tenantb");
  users.push(userA.id, userB.id);
  const orgA = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${userA.token}`)
    .send({ name: `A ${userA.id.slice(0, 8)}` });
  const orgB = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${userB.token}`)
    .send({ name: `B ${userB.id.slice(0, 8)}` });
  orgs.push(orgA.body.data.id, orgB.body.data.id);

  const companyB = await prisma.company.create({
    data: {
      organizationId: orgB.body.data.id,
      name: "Globex",
      ownerId: userB.id,
    },
  });
  const contactB = await prisma.contact.create({
    data: {
      organizationId: orgB.body.data.id,
      firstName: "Other",
      lastName: "Tenant",
      email: `other-${userB.id.slice(0, 8)}@b.test`,
      companyId: companyB.id,
      ownerId: userB.id,
    },
  });
  const pipelineB = await prisma.pipeline.findFirstOrThrow({
    where: { organizationId: orgB.body.data.id },
    include: { stages: { orderBy: { order: "asc" } } },
  });
  const dealB = await prisma.deal.create({
    data: {
      organizationId: orgB.body.data.id,
      name: "Secret deal",
      companyId: companyB.id,
      primaryContactId: contactB.id,
      pipelineId: pipelineB.id,
      stageId: pipelineB.stages[0]!.id,
      ownerId: userB.id,
      currency: "USD",
    },
  });

  return { userA, userB, orgA: orgA.body.data.id, orgB: orgB.body.data.id, companyB, contactB, dealB };
}

describe("tenant isolation", () => {
  it("allows a user to access their own contact and denies the other org", async () => {
    const ctx = await provision();
    const own = await request(app)
      .post("/api/v1/contacts")
      .set("Authorization", `Bearer ${ctx.userA.token}`)
      .send({
        firstName: "Ada",
        lastName: "Own",
        organization_id: ctx.orgB,
        owner_id: ctx.userB.id,
      });
    expect(own.status).toBe(201);
    expect(own.body.data.organizationId).toBe(ctx.orgA);
    expect(own.body.data.ownerId).toBe(ctx.userA.id);

    const allowed = await request(app)
      .get(`/api/v1/contacts/${own.body.data.id}`)
      .set("Authorization", `Bearer ${ctx.userA.token}`);
    expect(allowed.status).toBe(200);

    const deniedContact = await request(app)
      .get(`/api/v1/contacts/${ctx.contactB.id}`)
      .set("Authorization", `Bearer ${ctx.userA.token}`);
    expect(deniedContact.status).toBe(404);

    const deniedCompany = await request(app)
      .get(`/api/v1/companies/${ctx.companyB.id}`)
      .set("Authorization", `Bearer ${ctx.userA.token}`);
    expect(deniedCompany.status).toBe(404);

    const deniedDeal = await request(app)
      .get(`/api/v1/deals/${ctx.dealB.id}`)
      .set("Authorization", `Bearer ${ctx.userA.token}`);
    expect(deniedDeal.status).toBe(404);
  });

  it("ignores a spoofed X-Organization-ID header for a foreign org", async () => {
    const ctx = await provision();
    const res = await request(app)
      .get("/api/v1/organizations/current")
      .set("Authorization", `Bearer ${ctx.userA.token}`)
      .set("x-organization-id", ctx.orgB);
    expect(res.status).toBe(403);
  });
});

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

async function orgWithRoles(prefix = "sadmin") {
  const admin = await createUser(prefix);
  const manager = await createUser(`${prefix}mgr`);
  const member = await createUser(`${prefix}mem`);
  users.push(admin.id, manager.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Search ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  await addMember(created.body.data.id, manager, "MANAGER");
  await addMember(created.body.data.id, member, "MEMBER");
  return { admin, manager, member, organizationId: created.body.data.id as string };
}

async function seedCrm(organizationId: string, ownerId: string, label: string) {
  const company = await prisma.company.create({
    data: { organizationId, name: `${label} Co`, industry: "Software", website: `${label.toLowerCase()}.example`, ownerId },
  });
  const contact = await prisma.contact.create({
    data: {
      organizationId,
      firstName: label,
      lastName: "Doe",
      email: `${label.toLowerCase()}-${ownerId.slice(0, 8)}@search.test`,
      phone: "+14155550100",
      jobTitle: "Senior Engineer",
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
      name: `${label} Enterprise`,
      companyId: company.id,
      primaryContactId: contact.id,
      pipelineId: pipeline.id,
      stageId: pipeline.stages[0]!.id,
      ownerId,
    },
  });
  const activity = await prisma.activity.create({
    data: {
      organizationId,
      type: "CALL",
      content: `${label} follow-up call`,
      authorId: ownerId,
      companyId: company.id,
      contactId: contact.id,
      dealId: deal.id,
    },
  });
  return { company, contact, deal, activity };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function ids(rows: Array<{ id: string }>) {
  return rows.map((row) => row.id);
}

describe("GET /api/v1/search", () => {
  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/search?q=john");
    expect(res.status).toBe(401);
  });

  it("validates query parameters", async () => {
    const ctx = await orgWithRoles("sval");
    const empty = await request(app).get("/api/v1/search?q=%20%20").set(auth(ctx.admin.token));
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe("INVALID");

    const huge = await request(app).get(`/api/v1/search?q=${"a".repeat(101)}`).set(auth(ctx.admin.token));
    expect(huge.status).toBe(400);

    const type = await request(app).get("/api/v1/search?q=john&type=tasks").set(auth(ctx.admin.token));
    expect(type.status).toBe(400);

    const negative = await request(app).get("/api/v1/search?q=john&limit=-1").set(auth(ctx.admin.token));
    expect(negative.status).toBe(400);

    const over = await request(app).get("/api/v1/search?q=john&limit=51").set(auth(ctx.admin.token));
    expect(over.status).toBe(400);
  });

  it("searches contacts, companies, deals, and activities with grouped results", async () => {
    const ctx = await orgWithRoles("sgrp");
    const seeded = await seedCrm(ctx.organizationId, ctx.admin.id, "Zephyr");

    const res = await request(app).get("/api/v1/search?q=zephyr").set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.query).toBe("zephyr");
    expect(ids(res.body.data.results.contacts)).toContain(seeded.contact.id);
    expect(ids(res.body.data.results.companies)).toContain(seeded.company.id);
    expect(ids(res.body.data.results.deals)).toContain(seeded.deal.id);
    expect(ids(res.body.data.results.activities)).toContain(seeded.activity.id);
    expect(res.body.data.results.contacts[0]).toMatchObject({
      type: "contact",
      title: "Zephyr Doe",
      href: `/contacts/${seeded.contact.id}`,
    });
    expect(res.body.data.results.companies[0].href).toBe(`/companies/${seeded.company.id}`);
    expect(res.body.data.results.deals[0].href).toBe(`/deals/${seeded.deal.id}`);
    expect(res.body.data.results.activities[0].href).toBe(`/activities/${seeded.activity.id}`);
    expect(res.body.data.total).toBeGreaterThan(0);
    expect(JSON.stringify(res.body.data)).not.toMatch(/password|token|secret|metadata/i);
  });

  it("filters by type", async () => {
    const ctx = await orgWithRoles("styp");
    await seedCrm(ctx.organizationId, ctx.admin.id, "Typed");
    const contacts = await request(app).get("/api/v1/search?q=typed&type=contacts").set(auth(ctx.admin.token));
    expect(contacts.body.data.results.contacts.length).toBeGreaterThan(0);
    expect(contacts.body.data.results.companies).toEqual([]);
    expect(contacts.body.data.results.deals).toEqual([]);
    expect(contacts.body.data.results.activities).toEqual([]);

    const companies = await request(app).get("/api/v1/search?q=typed&type=companies").set(auth(ctx.admin.token));
    expect(companies.body.data.results.companies.length).toBeGreaterThan(0);
    expect(companies.body.data.results.contacts).toEqual([]);
  });

  it("never returns another organization's records, even with matching names or a spoofed organizationId", async () => {
    const a = await orgWithRoles("sidora");
    const b = await orgWithRoles("sidorb");
    const local = await seedCrm(a.organizationId, a.admin.id, "John");
    const foreign = await seedCrm(b.organizationId, b.admin.id, "John");

    const res = await request(app)
      .get(`/api/v1/search?q=john&organizationId=${b.organizationId}`)
      .set(auth(a.admin.token));
    expect(res.status).toBe(200);
    expect(ids(res.body.data.results.contacts)).toEqual([local.contact.id]);
    expect(ids(res.body.data.results.companies)).toEqual([local.company.id]);
    expect(ids(res.body.data.results.deals)).toEqual([local.deal.id]);
    expect(ids(res.body.data.results.activities)).toEqual([local.activity.id]);
    expect(ids(res.body.data.results.contacts)).not.toContain(foreign.contact.id);
    expect(ids(res.body.data.results.companies)).not.toContain(foreign.company.id);
    expect(ids(res.body.data.results.deals)).not.toContain(foreign.deal.id);
    expect(ids(res.body.data.results.activities)).not.toContain(foreign.activity.id);

    const stolenContact = await request(app).get(`/api/v1/contacts/${foreign.contact.id}`).set(auth(a.admin.token));
    expect(stolenContact.status).toBe(404);
    const stolenCompany = await request(app).get(`/api/v1/companies/${foreign.company.id}`).set(auth(a.admin.token));
    expect(stolenCompany.status).toBe(404);
    const stolenDeal = await request(app).get(`/api/v1/deals/${foreign.deal.id}`).set(auth(a.admin.token));
    expect(stolenDeal.status).toBe(404);
    const stolenActivity = await request(app).get(`/api/v1/activities/${foreign.activity.id}`).set(auth(a.admin.token));
    expect(stolenActivity.status).toBe(404);
  });

  it("applies MEMBER owner visibility and ADMIN/MANAGER team visibility", async () => {
    const ctx = await orgWithRoles("svis");
    const adminOwned = await seedCrm(ctx.organizationId, ctx.admin.id, "Hidden");
    const memberOwned = await seedCrm(ctx.organizationId, ctx.member.id, "Hidden");

    const member = await request(app).get("/api/v1/search?q=hidden").set(auth(ctx.member.token));
    expect(ids(member.body.data.results.contacts)).toEqual([memberOwned.contact.id]);
    expect(ids(member.body.data.results.companies)).toEqual([memberOwned.company.id]);
    expect(ids(member.body.data.results.deals)).toEqual([memberOwned.deal.id]);
    expect(ids(member.body.data.results.activities)).toEqual([memberOwned.activity.id]);
    expect(ids(member.body.data.results.contacts)).not.toContain(adminOwned.contact.id);

    const manager = await request(app).get("/api/v1/search?q=hidden").set(auth(ctx.manager.token));
    expect(ids(manager.body.data.results.contacts).sort()).toEqual([adminOwned.contact.id, memberOwned.contact.id].sort());

    const admin = await request(app).get("/api/v1/search?q=hidden").set(auth(ctx.admin.token));
    expect(ids(admin.body.data.results.contacts).sort()).toEqual([adminOwned.contact.id, memberOwned.contact.id].sort());
  });

  it("ranks exact matches ahead of prefix and partial, then recency", async () => {
    const ctx = await orgWithRoles("srank");
    const prefix = await prisma.company.create({
      data: { organizationId: ctx.organizationId, name: "Acme Labs", ownerId: ctx.admin.id },
    });
    const partial = await prisma.company.create({
      data: { organizationId: ctx.organizationId, name: "North Acme", ownerId: ctx.admin.id },
    });
    const exactOld = await prisma.company.create({
      data: { organizationId: ctx.organizationId, name: "Acme", ownerId: ctx.admin.id },
    });
    const exactNew = await prisma.company.create({
      data: { organizationId: ctx.organizationId, name: "Acme", ownerId: ctx.admin.id },
    });
    await prisma.$executeRaw`UPDATE companies SET updated_at = ${new Date("2024-01-01T00:00:00.000Z")} WHERE id = CAST(${exactOld.id} AS uuid)`;
    await prisma.$executeRaw`UPDATE companies SET updated_at = ${new Date("2026-06-01T00:00:00.000Z")} WHERE id = CAST(${exactNew.id} AS uuid)`;
    await prisma.$executeRaw`UPDATE companies SET updated_at = ${new Date("2026-07-01T00:00:00.000Z")} WHERE id = CAST(${prefix.id} AS uuid)`;
    await prisma.$executeRaw`UPDATE companies SET updated_at = ${new Date("2026-08-01T00:00:00.000Z")} WHERE id = CAST(${partial.id} AS uuid)`;

    const res = await request(app).get("/api/v1/search?q=acme&type=companies").set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(ids(res.body.data.results.companies)).toEqual([exactNew.id, exactOld.id, prefix.id, partial.id]);
    expect(res.body.data.results.companies.map((row: { relevance: number }) => row.relevance)).toEqual([1, 1, 2, 3]);
  });

  it("matches contact full name, email, phone, and job title", async () => {
    const ctx = await orgWithRoles("sflds");
    const contact = await prisma.contact.create({
      data: {
        organizationId: ctx.organizationId,
        firstName: "Ada",
        lastName: "Lovelace",
        email: `ada-${ctx.admin.id.slice(0, 8)}@search.test`,
        phone: "+14155550999",
        jobTitle: "Mathematician",
        ownerId: ctx.admin.id,
      },
    });
    const byName = await request(app).get("/api/v1/search?q=Ada%20Lovelace&type=contacts").set(auth(ctx.admin.token));
    expect(ids(byName.body.data.results.contacts)).toContain(contact.id);
    const byEmail = await request(app).get("/api/v1/search?q=search.test&type=contacts").set(auth(ctx.admin.token));
    expect(ids(byEmail.body.data.results.contacts)).toContain(contact.id);
    const byTitle = await request(app).get("/api/v1/search?q=Mathematician&type=contacts").set(auth(ctx.admin.token));
    expect(ids(byTitle.body.data.results.contacts)).toContain(contact.id);
  });

  it("caps result size and does not load unbounded rows", async () => {
    const ctx = await orgWithRoles("slim");
    await prisma.company.createMany({
      data: Array.from({ length: 60 }, (_, i) => ({
        organizationId: ctx.organizationId,
        name: `LimitCo ${i}`,
        ownerId: ctx.admin.id,
      })),
    });
    const res = await request(app).get("/api/v1/search?q=limitco&type=companies&limit=20").set(auth(ctx.admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.results.companies.length).toBe(20);
    expect(res.body.data.total).toBe(20);
    expect(res.body.data.total).toBeLessThanOrEqual(50);
  });
});

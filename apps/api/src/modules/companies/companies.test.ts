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
  const admin = await createUser("cadmin");
  const manager = await createUser("cmgr");
  const member = await createUser("cmem");
  users.push(admin.id, manager.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Co ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  await addMember(created.body.data.id, manager, "MANAGER");
  await addMember(created.body.data.id, member, "MEMBER");
  return { admin, manager, member, organizationId: created.body.data.id as string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("companies", () => {
  it("lets ADMIN, MANAGER, and MEMBER create, and rejects unauthenticated users", async () => {
    const ctx = await orgWithRoles();
    const admin = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Acme Technologies", industry: "SaaS", employeeCount: 50, website: "acme.com", tags: [" SaaS ", "saas"] });
    expect(admin.status).toBe(201);
    expect(admin.body.data.organizationId).toBe(ctx.organizationId);
    expect(admin.body.data.ownerId).toBe(ctx.admin.id);
    expect(admin.body.data.website).toMatch(/^https:\/\/acme.com/);
    expect(admin.body.data.tags).toEqual(["saas"]);

    const manager = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.manager.token))
      .send({ name: "Manager Co" });
    expect(manager.status).toBe(201);
    expect(manager.body.data.ownerId).toBe(ctx.manager.id);

    const member = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.member.token))
      .send({ name: "Member Co", ownerId: ctx.admin.id, organizationId: "00000000-0000-4000-8000-000000000099" });
    expect(member.status).toBe(201);
    expect(member.body.data.ownerId).toBe(ctx.member.id);
    expect(member.body.data.organizationId).toBe(ctx.organizationId);

    const anon = await request(app).post("/api/v1/companies").send({ name: "Nope" });
    expect(anon.status).toBe(401);
  });

  it("enforces tenant isolation on read, update, and delete", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const created = await request(app)
      .post("/api/v1/companies")
      .set(auth(b.admin.token))
      .send({ name: "Secret Co" });

    const read = await request(app).get(`/api/v1/companies/${created.body.data.id}`).set(auth(a.admin.token));
    expect(read.status).toBe(404);

    const update = await request(app)
      .patch(`/api/v1/companies/${created.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ name: "Hijack" });
    expect(update.status).toBe(404);

    const remove = await request(app).delete(`/api/v1/companies/${created.body.data.id}`).set(auth(a.admin.token));
    expect(remove.status).toBe(404);

    const list = await request(app).get("/api/v1/companies").set(auth(a.admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((row: { id: string }) => row.id === created.body.data.id)).toBe(false);
  });

  it("validates updates and owner assignment", async () => {
    const ctx = await orgWithRoles();
    const outsider = await createUser("out");
    users.push(outsider.id);
    await request(app).get("/api/v1/auth/me").set(auth(outsider.token));

    const company = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Valid Co" });

    const ok = await request(app)
      .patch(`/api/v1/companies/${company.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ name: "Valid Co Updated", ownerId: ctx.manager.id, notes: "Keep close" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.ownerId).toBe(ctx.manager.id);

    const invalidOwner = await request(app)
      .patch(`/api/v1/companies/${company.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ ownerId: outsider.id });
    expect(invalidOwner.status).toBe(400);
    expect(invalidOwner.body.error.code).toBe("INVALID_OWNER");

    const employees = await request(app)
      .patch(`/api/v1/companies/${company.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ employeeCount: -4 });
    expect(employees.status).toBe(400);

    const website = await request(app)
      .patch(`/api/v1/companies/${company.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ website: "not a url" });
    expect(website.status).toBe(400);

    const spoof = await request(app)
      .patch(`/api/v1/companies/${company.body.data.id}`)
      .set(auth(ctx.admin.token))
      .send({ organization_id: "00000000-0000-4000-8000-000000000099", owner_id: outsider.id });
    expect(spoof.status).toBe(400);
  });

  it("blocks deletion when related records exist and allows a clean delete", async () => {
    const ctx = await orgWithRoles();
    const company = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Has Contact" });
    await request(app)
      .post("/api/v1/contacts")
      .set(auth(ctx.admin.token))
      .send({ firstName: "Rel", lastName: "Ated", companyId: company.body.data.id });

    const blocked = await request(app).delete(`/api/v1/companies/${company.body.data.id}`).set(auth(ctx.admin.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("COMPANY_HAS_DEPENDENCIES");

    const empty = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Empty Co" });
    const removed = await request(app).delete(`/api/v1/companies/${empty.body.data.id}`).set(auth(ctx.admin.token));
    expect(removed.status).toBe(200);

    const memberOwned = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.member.token))
      .send({ name: "Member Empty" });
    const unauthorized = await request(app)
      .delete(`/api/v1/companies/${memberOwned.body.data.id}`)
      .set(auth(ctx.member.token));
    expect(unauthorized.status).toBe(403);
  });

  it("paginates, searches, filters, and sorts without interpolating sort fields", async () => {
    const ctx = await orgWithRoles();
    await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Acme Technologies", industry: "SaaS", tags: ["enterprise"] });
    await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Beta Labs", industry: "Health", ownerId: ctx.manager.id });

    const page = await request(app).get("/api/v1/companies?page=1&limit=1&sortBy=name&sortOrder=asc").set(auth(ctx.admin.token));
    expect(page.status).toBe(200);
    expect(page.body.data.items).toHaveLength(1);
    expect(page.body.data.pagination.limit).toBe(1);
    expect(page.body.data.pagination.total).toBeGreaterThanOrEqual(2);

    const search = await request(app).get("/api/v1/companies?search=acme").set(auth(ctx.admin.token));
    expect(search.body.data.items.every((row: { name: string }) => /acme/i.test(row.name))).toBe(true);

    const industry = await request(app).get("/api/v1/companies?industry=SaaS").set(auth(ctx.admin.token));
    expect(industry.body.data.items.every((row: { industry: string }) => row.industry === "SaaS")).toBe(true);

    const owner = await request(app).get(`/api/v1/companies?owner=${ctx.manager.id}`).set(auth(ctx.admin.token));
    expect(owner.body.data.items.every((row: { ownerId: string }) => row.ownerId === ctx.manager.id)).toBe(true);

    const tag = await request(app).get("/api/v1/companies?tag=enterprise").set(auth(ctx.admin.token));
    expect(tag.body.data.items[0]?.tags).toContain("enterprise");

    const unsafe = await request(app)
      .get("/api/v1/companies?sortBy=DROP%20TABLE&limit=1000000")
      .set(auth(ctx.admin.token));
    expect(unsafe.status).toBe(200);
    expect(unsafe.body.data.pagination.limit).toBe(100);

    const memberList = await request(app).get("/api/v1/companies").set(auth(ctx.member.token));
    expect(memberList.body.data.items.every((row: { ownerId: string }) => row.ownerId === ctx.member.id)).toBe(true);
  });

  it("returns related contacts and real open pipeline value on detail", async () => {
    const ctx = await orgWithRoles();
    const company = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Pipeline Co" });
    const contact = await request(app)
      .post("/api/v1/contacts")
      .set(auth(ctx.admin.token))
      .send({ firstName: "Pat", lastName: "Lee", companyId: company.body.data.id });
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: ctx.organizationId },
      include: { stages: { orderBy: { order: "asc" } } },
    });
    const openStage = pipeline.stages.find((stage) => !stage.isWon && !stage.isLost)!;
    await prisma.deal.create({
      data: {
        organizationId: ctx.organizationId,
        name: "Open deal",
        companyId: company.body.data.id,
        primaryContactId: contact.body.data.id,
        pipelineId: pipeline.id,
        stageId: openStage.id,
        ownerId: ctx.admin.id,
        amount: 2500,
      },
    });

    const detail = await request(app).get(`/api/v1/companies/${company.body.data.id}`).set(auth(ctx.admin.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.contacts).toHaveLength(1);
    expect(detail.body.data.openPipelineValue).toBe(2500);
    expect(detail.body.data.deals).toHaveLength(1);
  });

  it("suggests similar company names without blocking create", async () => {
    const ctx = await orgWithRoles();
    await request(app).post("/api/v1/companies").set(auth(ctx.admin.token)).send({ name: "Acme Technologies" });
    const matches = await request(app).get("/api/v1/companies/duplicates?name=Acme%20Technology").set(auth(ctx.admin.token));
    expect(matches.status).toBe(200);
    expect(matches.body.data.length).toBeGreaterThan(0);

    const created = await request(app)
      .post("/api/v1/companies")
      .set(auth(ctx.admin.token))
      .send({ name: "Acme Technology Pvt Ltd" });
    expect(created.status).toBe(201);
  });
});

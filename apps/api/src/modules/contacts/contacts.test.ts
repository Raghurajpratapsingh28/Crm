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
  const admin = await createUser("tadmin");
  const manager = await createUser("tmgr");
  const member = await createUser("tmem");
  users.push(admin.id, manager.id, member.id);
  const created = await request(app)
    .post("/api/v1/organizations")
    .set("Authorization", `Bearer ${admin.token}`)
    .send({ name: `Ct ${admin.id.slice(0, 8)}` });
  orgs.push(created.body.data.id);
  await addMember(created.body.data.id, manager, "MANAGER");
  await addMember(created.body.data.id, member, "MEMBER");
  return { admin, manager, member, organizationId: created.body.data.id as string };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("contacts", () => {
  it("creates contacts with and without a company and rejects cross-org companies", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const companyA = await request(app).post("/api/v1/companies").set(auth(a.admin.token)).send({ name: "Acme" });
    const companyB = await request(app).post("/api/v1/companies").set(auth(b.admin.token)).send({ name: "Globex" });

    const standalone = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "John", lastName: "Smith", email: `john-${a.admin.id.slice(0, 8)}@example.com` });
    expect(standalone.status).toBe(201);
    expect(standalone.body.data.companyId).toBeNull();
    expect(standalone.body.data.organizationId).toBe(a.organizationId);

    const linked = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({
        firstName: "Jane",
        lastName: "Doe",
        companyId: companyA.body.data.id,
        source: "REFERRAL",
        phone: "+91 98765 43210",
      });
    expect(linked.status).toBe(201);
    expect(linked.body.data.companyId).toBe(companyA.body.data.id);
    expect(linked.body.data.phone).toBe("+919876543210");

    const missing = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "No", lastName: "Company", companyId: "00000000-0000-4000-8000-000000000099" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("INVALID_COMPANY_ASSOCIATION");

    const cross = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "Cross", lastName: "Org", companyId: companyB.body.data.id });
    expect(cross.status).toBe(400);
    expect(cross.body.error.code).toBe("INVALID_COMPANY_ASSOCIATION");
  });

  it("detects duplicate emails, including normalized case, and keeps orgs isolated", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const first = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "John", lastName: "Smith", email: "John@Example.com" });
    expect(first.status).toBe(201);
    expect(first.body.data.email).toBe("john@example.com");

    const duplicate = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "Jon", lastName: "Clone", email: " JOHN@example.com " });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("CONTACT_DUPLICATE");
    expect(duplicate.body.data.existingContactId).toBe(first.body.data.id);

    const otherOrg = await request(app)
      .post("/api/v1/contacts")
      .set(auth(b.admin.token))
      .send({ firstName: "John", lastName: "Other", email: "john@example.com" });
    expect(otherOrg.status).toBe(201);
  });

  it("prevents concurrent duplicate emails at the database", async () => {
    const ctx = await orgWithRoles();
    const email = `race-${ctx.admin.id.slice(0, 8)}@example.com`;
    const [one, two] = await Promise.all([
      request(app)
        .post("/api/v1/contacts")
        .set(auth(ctx.admin.token))
        .send({ firstName: "A", lastName: "One", email }),
      request(app)
        .post("/api/v1/contacts")
        .set(auth(ctx.admin.token))
        .send({ firstName: "B", lastName: "Two", email }),
    ]);
    const statuses = [one.status, two.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = one.status === 409 ? one : two;
    expect(failed.body.error.code).toBe("CONTACT_DUPLICATE");
    const stored = await prisma.contact.count({ where: { organizationId: ctx.organizationId, email } });
    expect(stored).toBe(1);
  });

  it("updates email, company, and owner with tenant checks", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const companyA = await request(app).post("/api/v1/companies").set(auth(a.admin.token)).send({ name: "Acme" });
    const companyA2 = await request(app).post("/api/v1/companies").set(auth(a.admin.token)).send({ name: "Acme Two" });
    const companyB = await request(app).post("/api/v1/companies").set(auth(b.admin.token)).send({ name: "Globex" });
    const other = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "Taken", lastName: "Mail", email: `taken-${a.admin.id.slice(0, 8)}@a.test` });
    const contact = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "John", lastName: "Smith" });

    const emailChange = await request(app)
      .patch(`/api/v1/contacts/${contact.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ email: `john-${a.admin.id.slice(0, 8)}@a.test`, companyId: companyA.body.data.id });
    expect(emailChange.status).toBe(200);
    expect(emailChange.body.data.companyId).toBe(companyA.body.data.id);

    const companyChange = await request(app)
      .patch(`/api/v1/contacts/${contact.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ companyId: companyA2.body.data.id, ownerId: a.manager.id });
    expect(companyChange.status).toBe(200);
    expect(companyChange.body.data.companyId).toBe(companyA2.body.data.id);
    expect(companyChange.body.data.ownerId).toBe(a.manager.id);

    const clearCompany = await request(app)
      .patch(`/api/v1/contacts/${contact.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ companyId: null });
    expect(clearCompany.status).toBe(200);
    expect(clearCompany.body.data.companyId).toBeNull();

    const crossCompany = await request(app)
      .patch(`/api/v1/contacts/${contact.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ companyId: companyB.body.data.id });
    expect(crossCompany.status).toBe(400);
    expect(crossCompany.body.error.code).toBe("INVALID_COMPANY_ASSOCIATION");

    const crossOwner = await request(app)
      .patch(`/api/v1/contacts/${contact.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ ownerId: b.admin.id });
    expect(crossOwner.status).toBe(400);
    expect(crossOwner.body.error.code).toBe("INVALID_OWNER");

    const dup = await request(app)
      .patch(`/api/v1/contacts/${contact.body.data.id}`)
      .set(auth(a.admin.token))
      .send({ email: other.body.data.email.toUpperCase() });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONTACT_DUPLICATE");
  });

  it("deletes when allowed, blocks members, and hides cross-tenant rows", async () => {
    const a = await orgWithRoles();
    const b = await orgWithRoles();
    const own = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.admin.token))
      .send({ firstName: "Del", lastName: "Me" });
    const foreign = await request(app)
      .post("/api/v1/contacts")
      .set(auth(b.admin.token))
      .send({ firstName: "Keep", lastName: "Secret" });
    const memberOwned = await request(app)
      .post("/api/v1/contacts")
      .set(auth(a.member.token))
      .send({ firstName: "Mem", lastName: "Own" });

    const unauthorized = await request(app)
      .delete(`/api/v1/contacts/${memberOwned.body.data.id}`)
      .set(auth(a.member.token));
    expect(unauthorized.status).toBe(403);

    const removed = await request(app).delete(`/api/v1/contacts/${own.body.data.id}`).set(auth(a.admin.token));
    expect(removed.status).toBe(200);

    const cross = await request(app).delete(`/api/v1/contacts/${foreign.body.data.id}`).set(auth(a.admin.token));
    expect(cross.status).toBe(404);
  });

  it("searches name, email, phone, company, and job title", async () => {
    const ctx = await orgWithRoles();
    const company = await request(app).post("/api/v1/companies").set(auth(ctx.admin.token)).send({ name: "Northwind" });
    await request(app)
      .post("/api/v1/contacts")
      .set(auth(ctx.admin.token))
      .send({
        firstName: "Ada",
        lastName: "Lovelace",
        email: `ada-${ctx.admin.id.slice(0, 8)}@northwind.test`,
        phone: "+14155550123",
        jobTitle: "VP Sales",
        companyId: company.body.data.id,
        source: "WEBSITE",
        industry: "SaaS",
        tags: ["enterprise"],
      });

    const name = await request(app).get("/api/v1/contacts?search=ada").set(auth(ctx.admin.token));
    expect(name.body.data.items.some((row: { firstName: string }) => row.firstName === "Ada")).toBe(true);

    const email = await request(app).get("/api/v1/contacts?search=northwind.test").set(auth(ctx.admin.token));
    expect(email.body.data.items.length).toBeGreaterThan(0);

    const phone = await request(app).get("/api/v1/contacts?search=4155550123").set(auth(ctx.admin.token));
    expect(phone.body.data.items.length).toBeGreaterThan(0);

    const companySearch = await request(app).get("/api/v1/contacts?search=northwind").set(auth(ctx.admin.token));
    expect(companySearch.body.data.items[0]?.company.name).toBe("Northwind");

    const title = await request(app).get("/api/v1/contacts?search=VP%20Sales").set(auth(ctx.admin.token));
    expect(title.body.data.items.length).toBeGreaterThan(0);

    const filtered = await request(app)
      .get(`/api/v1/contacts?owner=${ctx.admin.id}&source=WEBSITE&industry=SaaS&tag=enterprise&company=${company.body.data.id}`)
      .set(auth(ctx.admin.token));
    expect(filtered.body.data.items).toHaveLength(1);

    const member = await request(app).get("/api/v1/contacts").set(auth(ctx.member.token));
    expect(member.body.data.items.every((row: { ownerId: string }) => row.ownerId === ctx.member.id)).toBe(true);
  });

  it("blocks contact deletion when a deal still references the contact", async () => {
    const ctx = await orgWithRoles();
    const company = await request(app).post("/api/v1/companies").set(auth(ctx.admin.token)).send({ name: "Deal Co" });
    const contact = await request(app)
      .post("/api/v1/contacts")
      .set(auth(ctx.admin.token))
      .send({ firstName: "Deal", lastName: "Owner", companyId: company.body.data.id });
    const pipeline = await prisma.pipeline.findFirstOrThrow({
      where: { organizationId: ctx.organizationId },
      include: { stages: true },
    });
    await prisma.deal.create({
      data: {
        organizationId: ctx.organizationId,
        name: "Stuck deal",
        companyId: company.body.data.id,
        primaryContactId: contact.body.data.id,
        pipelineId: pipeline.id,
        stageId: pipeline.stages[0]!.id,
        ownerId: ctx.admin.id,
      },
    });

    const blocked = await request(app).delete(`/api/v1/contacts/${contact.body.data.id}`).set(auth(ctx.admin.token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("CONTACT_HAS_DEPENDENCIES");
  });
});

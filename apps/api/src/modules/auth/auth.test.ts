import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma.js";
import { app, cleanupUser, createUser, signAccessToken } from "../../test/helpers.js";

const createdUsers: string[] = [];

afterAll(async () => {
  for (const id of createdUsers) {
    await cleanupUser(id);
  }
  await prisma.$disconnect();
});

describe("authentication", () => {
  it("rejects a missing Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an invalid JWT", async () => {
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects an expired JWT", async () => {
    const id = randomUUID();
    const token = await signAccessToken({
      sub: id,
      email: `expired-${id.slice(0, 8)}@test.local`,
      expired: true,
    });
    const res = await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it("creates a local user on first valid JWT", async () => {
    const user = await createUser("first");
    createdUsers.push(user.id);
    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.organization).toBeNull();
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored).not.toBeNull();
    expect("passwordHash" in (stored ?? {})).toBe(false);
  });

  it("reuses the existing local user on later requests", async () => {
    const user = await createUser("reuse");
    createdUsers.push(user.id);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${user.token}`);
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${user.token}`);
    const count = await prisma.user.count({ where: { email: user.email } });
    expect(count).toBe(1);
  });
});

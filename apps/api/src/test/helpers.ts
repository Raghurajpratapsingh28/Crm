import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../app.js";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

export const app = createApp();

export function issuer() {
  const url = env.supabaseUrl.replace(/\/$/, "");
  return url.startsWith("http") ? `${url}/auth/v1` : undefined;
}

export async function signAccessToken(input: {
  sub: string;
  email: string;
  fullName?: string;
  expiresIn?: string;
  expired?: boolean;
}) {
  const jwt = new SignJWT({
    email: input.email,
    aud: "authenticated",
    role: "authenticated",
    user_metadata: { full_name: input.fullName ?? "Test User" },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub)
    .setIssuedAt();

  const iss = issuer();
  if (iss) jwt.setIssuer(iss);

  if (input.expired) {
    jwt.setExpirationTime(Math.floor(Date.now() / 1000) - 30);
  } else {
    jwt.setExpirationTime(input.expiresIn ?? "10m");
  }

  return jwt.sign(new TextEncoder().encode(env.supabaseJwtSecret));
}

export function auth(token: string) {
  return request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`);
}

export async function createUser(emailPrefix = "user") {
  const id = randomUUID();
  const email = `${emailPrefix}-${id.slice(0, 8)}@test.local`;
  const token = await signAccessToken({ sub: id, email, fullName: emailPrefix });
  return { id, email, token };
}

export async function cleanupUser(userId: string) {
  await prisma.auditLog.deleteMany({ where: { actorId: userId } });
  await prisma.organizationMember.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

export async function cleanupOrganization(organizationId: string) {
  await prisma.job.deleteMany({ where: { organizationId } });
  await prisma.auditLog.deleteMany({ where: { organizationId } });
  await prisma.paymentEvent.deleteMany({ where: { organizationId } });
  await prisma.invoice.deleteMany({ where: { organizationId } });
  await prisma.notification.deleteMany({ where: { organizationId } });
  await prisma.task.deleteMany({ where: { organizationId } });
  await prisma.activity.deleteMany({ where: { organizationId } });
  await prisma.deal.deleteMany({ where: { organizationId } });
  await prisma.pipelineStage.deleteMany({ where: { organizationId } });
  await prisma.pipeline.deleteMany({ where: { organizationId } });
  await prisma.contact.deleteMany({ where: { organizationId } });
  await prisma.company.deleteMany({ where: { organizationId } });
  await prisma.subscription.deleteMany({ where: { organizationId } });
  await prisma.organizationMember.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
}

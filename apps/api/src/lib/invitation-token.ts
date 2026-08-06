import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createInvitationToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashInvitationToken(raw) };
}

export function hashInvitationToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function invitationHashesEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

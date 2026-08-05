import { invalid } from "../utils/errors.js";

export function rejectProtectedFields(body: unknown, extra: string[] = []) {
  if (!body || typeof body !== "object") return;
  const banned = new Set([
    "organization_id",
    "organizationId",
    "owner_id",
    "ownerId",
    "created_by",
    "createdBy",
    "createdById",
    "created_at",
    "createdAt",
    "role",
    "permissions",
    "supabase_user_id",
    "supabaseUserId",
    "user_id",
    "userId",
    ...extra,
  ]);
  for (const key of Object.keys(body)) {
    if (banned.has(key)) {
      throw invalid(`${key} cannot be set from the client`);
    }
  }
}

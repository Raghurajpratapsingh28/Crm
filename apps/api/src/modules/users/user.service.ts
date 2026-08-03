import { prisma } from "../../lib/prisma.js";
import type { SupabaseJwt } from "../../lib/supabase.js";
import { displayNameFromClaims } from "../../lib/supabase.js";

export interface LocalUser {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

export async function upsertLocalUser(claims: SupabaseJwt): Promise<LocalUser> {
  const email = claims.email?.trim().toLowerCase();
  if (!claims.sub || !email) {
    throw new Error("Supabase token is missing sub or email");
  }

  const fullName = displayNameFromClaims(claims, email);
  const avatarUrl = claims.user_metadata?.avatar_url ?? undefined;

  const user = await prisma.user.upsert({
    where: { id: claims.sub },
    create: {
      id: claims.sub,
      email,
      fullName,
      avatarUrl,
    },
    update: {
      email,
      ...(claims.user_metadata?.full_name || claims.user_metadata?.name
        ? { fullName }
        : {}),
      ...(avatarUrl ? { avatarUrl } : {}),
    },
    select: { id: true, email: true, fullName: true, avatarUrl: true },
  });

  return user;
}

export async function findActiveMemberships(userId: string) {
  return prisma.organizationMember.findMany({
    where: { userId, status: "ACTIVE" },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
}

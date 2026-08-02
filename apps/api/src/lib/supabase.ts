import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

export interface SupabaseJwt extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
}

const jwks = env.supabaseUrl
  ? createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`))
  : null;

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwt> {
  if (jwks) {
    const { payload } = await jwtVerify(token, jwks);
    return payload as SupabaseJwt;
  }

  const secret = new TextEncoder().encode(env.supabaseJwtSecret);
  const { payload } = await jwtVerify(token, secret);
  return payload as SupabaseJwt;
}

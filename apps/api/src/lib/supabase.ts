import { decodeProtectedHeader, createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

export interface SupabaseJwt extends JWTPayload {
  sub: string;
  email?: string;
  role?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
    avatar_url?: string;
  };
}

const jwks = isHttpUrl(env.supabaseUrl)
  ? createRemoteJWKSet(new URL(`${trimSlash(env.supabaseUrl)}/auth/v1/.well-known/jwks.json`))
  : null;

function trimSlash(url: string) {
  return url.replace(/\/$/, "");
}

function isHttpUrl(url: string) {
  return url.startsWith("https://") || url.startsWith("http://");
}

function verifyOptions() {
  const issuer = isHttpUrl(env.supabaseUrl)
    ? `${trimSlash(env.supabaseUrl)}/auth/v1`
    : undefined;
  return {
    audience: "authenticated",
    ...(issuer ? { issuer } : {}),
  };
}

export async function verifySupabaseJwt(token: string): Promise<SupabaseJwt> {
  const header = decodeProtectedHeader(token);
  const options = verifyOptions();

  if (header.alg === "HS256") {
    const secret = new TextEncoder().encode(env.supabaseJwtSecret);
    const { payload } = await jwtVerify(token, secret, options);
    return payload as SupabaseJwt;
  }

  if (jwks) {
    const { payload } = await jwtVerify(token, jwks, options);
    return payload as SupabaseJwt;
  }

  throw new Error("No JWT verification key configured");
}

export function displayNameFromClaims(claims: SupabaseJwt, fallback = "User") {
  return (
    claims.user_metadata?.full_name ||
    claims.user_metadata?.name ||
    (claims.email ? claims.email.split("@")[0] : undefined) ||
    fallback
  );
}

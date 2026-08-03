import type { NextFunction, Request, Response } from "express";
import { verifySupabaseJwt } from "../lib/supabase.js";
import { upsertLocalUser } from "../modules/users/user.service.js";
import { unauthorized } from "../utils/errors.js";

export interface AuthContext {
  userId: string;
  supabaseUserId: string;
  email: string;
  fullName: string;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
  supabaseUserId?: string;
  supabaseEmail?: string;
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header) {
    next(unauthorized("Authentication required"));
    return;
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    next(unauthorized("Authentication required"));
    return;
  }

  try {
    const claims = await verifySupabaseJwt(token);
    if (!claims.sub) {
      next(unauthorized("Authentication required"));
      return;
    }

    const user = await upsertLocalUser(claims);
    req.auth = {
      userId: user.id,
      supabaseUserId: claims.sub,
      email: user.email,
      fullName: user.fullName,
    };
    req.userId = user.id;
    req.supabaseUserId = claims.sub;
    req.supabaseEmail = user.email;
    next();
  } catch {
    next(unauthorized("Authentication required"));
  }
}

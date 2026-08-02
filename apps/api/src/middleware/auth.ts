import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { verifySupabaseJwt } from "../lib/supabase.js";
import { AppError } from "../utils/errors.js";

export interface AuthedRequest extends Request {
  supabaseUserId?: string;
  supabaseEmail?: string;
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new AppError(401, "unauthorized", "Missing Bearer token"));
    return;
  }

  try {
    const claims = await verifySupabaseJwt(header.slice(7));
    req.supabaseUserId = claims.sub;
    req.supabaseEmail = claims.email;

    const user = await prisma.user.findUnique({
      where: { supabaseUserId: claims.sub },
      select: { id: true },
    });
    req.userId = user?.id;
    next();
  } catch {
    next(new AppError(401, "unauthorized", "Invalid or expired token"));
  }
}

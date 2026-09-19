import type { NextFunction, Request, Response } from "express";
import { verifySupabaseJwt } from "../lib/supabase.js";
import { prisma } from "../lib/prisma.js";

export interface AuthedRequest extends Request {
  supabaseUserId?: string;
  supabaseEmail?: string;
  userId?: string;
}

export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing Bearer token" });
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
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
  }
}

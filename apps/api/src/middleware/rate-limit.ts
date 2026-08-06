import type { NextFunction, Request, Response } from "express";
import { fail } from "../utils/errors.js";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { name: string; windowMs: number; max: number; key: (req: Request) => string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.name}:${options.key(req)}`;
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    if (current.count >= options.max) {
      next(fail(429, "RATE_LIMITED", "Too many requests. Try again shortly."));
      return;
    }
    current.count += 1;
    next();
  };
}

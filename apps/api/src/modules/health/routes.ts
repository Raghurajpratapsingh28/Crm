import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../utils/async-handler.js";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "api" });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ ok: true, service: "api" });
    } catch {
      res.status(503).json({ ok: false, service: "api", reason: "database_unavailable" });
    }
  }),
);

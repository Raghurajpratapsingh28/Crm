import { Router } from "express";
import { prisma } from "../../lib/prisma.js";

export const healthRouter: Router = Router();

healthRouter.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: "api" });
  } catch {
    res.status(503).json({ ok: false, service: "api" });
  }
});

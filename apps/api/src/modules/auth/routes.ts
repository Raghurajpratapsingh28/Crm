import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { requireTenant, type TenantRequest } from "../../middleware/tenant.js";

export const authRouter: Router = Router();

authRouter.get("/me", requireAuth, requireTenant, async (req: TenantRequest, res) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.userId },
    select: { id: true, email: true, fullName: true, avatarUrl: true, supabaseUserId: true },
  });

  res.json({
    ...user,
    organizationId: req.organizationId,
    role: req.role,
  });
});

authRouter.post("/onboard", requireAuth, async (req: AuthedRequest, res) => {
  if (!req.supabaseUserId || !req.supabaseEmail) {
    res.status(401).json({ error: "unauthorized", message: "Missing identity" });
    return;
  }

  const { organizationName, fullName } = req.body as {
    organizationName?: string;
    fullName?: string;
  };

  if (!organizationName || !fullName) {
    res.status(400).json({ error: "invalid", message: "organizationName and fullName are required" });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { supabaseUserId: req.supabaseUserId },
      update: { fullName, email: req.supabaseEmail! },
      create: {
        supabaseUserId: req.supabaseUserId!,
        email: req.supabaseEmail!,
        fullName,
      },
    });

    const organization = await tx.organization.create({
      data: { name: organizationName },
    });

    await tx.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: "ADMIN",
        status: "ACTIVE",
      },
    });

    await tx.pipeline.create({
      data: {
        organizationId: organization.id,
        name: "Sales",
        stages: {
          create: [
            { name: "Lead", order: 0 },
            { name: "Contacted", order: 1 },
            { name: "Qualified", order: 2 },
            { name: "Meeting", order: 3 },
            { name: "Proposal", order: 4 },
            { name: "Negotiation", order: 5 },
            { name: "Won", order: 6, isWon: true },
            { name: "Lost", order: 7, isLost: true },
          ],
        },
      },
    });

    return { user, organization };
  });

  res.status(201).json(result);
});

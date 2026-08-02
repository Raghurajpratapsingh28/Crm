import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { requireTenant, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { AppError } from "../../utils/errors.js";

export const authRouter: Router = Router();

authRouter.get(
  "/me",
  requireAuth,
  requireTenant,
  asyncHandler(async (req, res) => {
    const { userId, organizationId, role } = req as TenantRequest;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        supabaseUserId: true,
      },
    });

    res.json({
      ...user,
      organizationId,
      role,
    });
  }),
);

authRouter.post(
  "/onboard",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { supabaseUserId, supabaseEmail } = req as AuthedRequest;
    if (!supabaseUserId || !supabaseEmail) {
      throw new AppError(401, "unauthorized", "Missing identity");
    }

    const { organizationName, fullName } = req.body as {
      organizationName?: string;
      fullName?: string;
    };

    if (!organizationName || !fullName) {
      throw new AppError(400, "invalid", "organizationName and fullName are required");
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { supabaseUserId },
        update: { fullName, email: supabaseEmail },
        create: {
          supabaseUserId,
          email: supabaseEmail,
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
  }),
);

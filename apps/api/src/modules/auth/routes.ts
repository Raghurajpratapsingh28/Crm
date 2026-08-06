import { permissionsForRole } from "@crm/types";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, ok } from "../../utils/errors.js";
import { getActiveMembership } from "../organizations/organization.service.js";
import { prisma } from "../../lib/prisma.js";

export const authRouter: Router = Router();

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).auth?.userId;
    if (!userId) throw forbidden();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, fullName: true, avatarUrl: true },
    });
    const membership = await getActiveMembership(userId);

    res.json(
      ok({
        user,
        organization: membership
          ? {
              id: membership.organization.id,
              name: membership.organization.name,
              timezone: membership.organization.timezone,
              currency: membership.organization.currency,
              role: membership.role,
              department: membership.department,
              membershipStatus: membership.status,
              permissions: permissionsForRole(membership.role),
            }
          : null,
        permissions: membership ? permissionsForRole(membership.role) : [],
        role: membership?.role ?? null,
      }),
    );
  }),
);

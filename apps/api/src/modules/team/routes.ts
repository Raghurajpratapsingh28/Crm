import { PERMISSIONS } from "@crm/types";
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../../middleware/auth.js";
import { requirePermission } from "../../middleware/permissions.js";
import { rateLimit } from "../../middleware/rate-limit.js";
import { requireTenant, tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { asyncHandler } from "../../utils/async-handler.js";
import { forbidden, notFound, ok } from "../../utils/errors.js";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  listInvitations,
  previewInvitation,
  resendInvitation,
} from "./invitation.service.js";
import {
  deactivateMember,
  getMemberActivity,
  getMemberDetail,
  listMembers,
  reactivateMember,
  updateMember,
} from "./team.service.js";
import { parseListQuery } from "./team.util.js";

function param(value: string | undefined) {
  if (!value) throw notFound();
  return value;
}

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  if (!userId) throw forbidden();
  return { organizationId, userId };
}

export const teamRouter: Router = Router();

teamRouter.get(
  "/invitations/:token",
  rateLimit({
    name: "invite-preview",
    windowMs: 15 * 60 * 1000,
    max: 60,
    key: (req) => req.ip ?? "unknown",
  }),
  asyncHandler(async (req, res) => {
    const preview = await previewInvitation(param(req.params.token));
    res.json(ok(preview));
  }),
);

teamRouter.post(
  "/invitations/:token/accept",
  requireAuth,
  rateLimit({
    name: "invite-accept",
    windowMs: 15 * 60 * 1000,
    max: 20,
    key: (req) => req.ip ?? "unknown",
  }),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    if (!auth) throw forbidden();
    const accepted = await acceptInvitation(param(req.params.token), {
      userId: auth.userId,
      email: auth.email,
    });
    res.json(ok(accepted));
  }),
);

teamRouter.use(requireAuth, requireTenant);

teamRouter.get(
  "/",
  requirePermission(PERMISSIONS.USERS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    res.json(ok(await listMembers(organizationId, req.query as Record<string, unknown>)));
  }),
);

teamRouter.get(
  "/invitations",
  requirePermission(PERMISSIONS.USERS_INVITE),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    const parsed = parseListQuery(req.query as Record<string, unknown>);
    res.json(
      ok(
        await listInvitations(organizationId, {
          ...parsed,
          status: String((req.query as { status?: string }).status ?? ""),
        }),
      ),
    );
  }),
);

teamRouter.post(
  "/invitations",
  requirePermission(PERMISSIONS.USERS_INVITE),
  rateLimit({
    name: "invite-create",
    windowMs: 10 * 60 * 1000,
    max: 30,
    key: (req) => tenantId(req as TenantRequest),
  }),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    const body = req.body as { email?: unknown; role?: unknown; department?: unknown };
    const invitation = await createInvitation({
      organizationId,
      actorId: userId,
      email: body.email,
      role: body.role,
      department: body.department,
    });
    res.status(201).json(ok(invitation));
  }),
);

teamRouter.post(
  "/invitations/:id/resend",
  requirePermission(PERMISSIONS.USERS_INVITE),
  rateLimit({
    name: "invite-resend",
    windowMs: 15 * 60 * 1000,
    max: 10,
    key: (req) => param(req.params.id),
  }),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    res.json(ok(await resendInvitation(organizationId, userId, param(req.params.id))));
  }),
);

teamRouter.post(
  "/invitations/:id/cancel",
  requirePermission(PERMISSIONS.USERS_INVITE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    res.json(ok(await cancelInvitation(organizationId, userId, param(req.params.id))));
  }),
);

teamRouter.get(
  "/:memberId/activity",
  requirePermission(PERMISSIONS.USERS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    res.json(ok(await getMemberActivity(organizationId, param(req.params.memberId))));
  }),
);

teamRouter.get(
  "/:memberId",
  requirePermission(PERMISSIONS.USERS_READ),
  asyncHandler(async (req, res) => {
    const { organizationId } = actor(req as TenantRequest);
    res.json(ok(await getMemberDetail(organizationId, param(req.params.memberId))));
  }),
);

teamRouter.patch(
  "/:memberId",
  requirePermission(PERMISSIONS.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    res.json(ok(await updateMember(organizationId, userId, param(req.params.memberId), req.body as { role?: unknown; department?: unknown })));
  }),
);

teamRouter.post(
  "/:memberId/deactivate",
  requirePermission(PERMISSIONS.USERS_DEACTIVATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    res.json(ok(await deactivateMember(organizationId, userId, param(req.params.memberId))));
  }),
);

teamRouter.delete(
  "/:memberId",
  requirePermission(PERMISSIONS.USERS_DEACTIVATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    res.json(ok(await deactivateMember(organizationId, userId, param(req.params.memberId))));
  }),
);

teamRouter.post(
  "/:memberId/reactivate",
  requirePermission(PERMISSIONS.USERS_UPDATE),
  asyncHandler(async (req, res) => {
    const { organizationId, userId } = actor(req as TenantRequest);
    res.json(ok(await reactivateMember(organizationId, userId, param(req.params.memberId))));
  }),
);

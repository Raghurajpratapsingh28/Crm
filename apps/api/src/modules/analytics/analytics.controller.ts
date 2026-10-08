import type { Response } from "express";
import { logger } from "../../utils/logger.js";
import { notFound, ok } from "../../utils/errors.js";
import type { TenantRequest } from "../../middleware/tenant.js";
import { tenantId } from "../../middleware/tenant.js";
import { getLeaderboard, getOverview, getPipeline, getRevenue, getWinRate } from "./analytics.service.js";
import { resolveAnalyticsFilters, type AnalyticsActor } from "./analytics.validation.js";

export function analyticsActor(req: TenantRequest): AnalyticsActor {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

function query(req: TenantRequest) {
  return req.query as Record<string, unknown>;
}

async function run<T>(
  req: TenantRequest,
  endpoint: string,
  handler: (actor: AnalyticsActor) => Promise<T>,
  res: Response,
) {
  const actor = analyticsActor(req);
  const started = Date.now();
  const data = await handler(actor);
  const q = query(req);
  logger.info({
    event: "analytics",
    endpoint,
    organizationId: actor.organizationId,
    userId: actor.userId,
    from: q.from ?? null,
    to: q.to ?? null,
    durationMs: Date.now() - started,
  });
  res.json(ok(data));
}

export async function overview(req: TenantRequest, res: Response) {
  await run(req, "overview", async (actor) => getOverview(actor, await resolveAnalyticsFilters(actor, query(req))), res);
}

export async function pipeline(req: TenantRequest, res: Response) {
  await run(req, "pipeline", async (actor) => getPipeline(actor, await resolveAnalyticsFilters(actor, query(req))), res);
}

export async function revenue(req: TenantRequest, res: Response) {
  await run(req, "revenue", async (actor) => getRevenue(actor, await resolveAnalyticsFilters(actor, query(req))), res);
}

export async function winRate(req: TenantRequest, res: Response) {
  await run(req, "win-rate", async (actor) => getWinRate(actor, await resolveAnalyticsFilters(actor, query(req))), res);
}

export async function leaderboard(req: TenantRequest, res: Response) {
  await run(
    req,
    "leaderboard",
    async (actor) => getLeaderboard(actor, await resolveAnalyticsFilters(actor, query(req))),
    res,
  );
}

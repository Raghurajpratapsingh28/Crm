import type { Response } from "express";
import { logger } from "../../utils/logger.js";
import { notFound, ok } from "../../utils/errors.js";
import { tenantId, type TenantRequest } from "../../middleware/tenant.js";
import { parseSearchQuery } from "./search.schema.js";
import { globalSearch } from "./search.service.js";

function actor(req: TenantRequest) {
  const organizationId = tenantId(req);
  const userId = req.auth?.userId;
  const role = req.tenant?.role;
  if (!userId || !role) throw notFound();
  return { organizationId, userId, role };
}

export async function search(req: TenantRequest, res: Response) {
  const started = Date.now();
  const current = actor(req);
  const parsed = parseSearchQuery(req.query as Record<string, unknown>);
  const data = await globalSearch(current, parsed);
  logger.info(
    {
      event: "search",
      organizationId: current.organizationId,
      userId: current.userId,
      type: parsed.type,
      limit: parsed.limit,
      total: data.total,
      durationMs: Date.now() - started,
    },
    "search",
  );
  res.json(ok(data));
}

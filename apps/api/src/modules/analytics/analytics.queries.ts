import { Prisma } from "@prisma/client";
import { hasTeamVisibility } from "../../services/authorization.service.js";
import type { AnalyticsActor, ResolvedAnalyticsFilters } from "./analytics.validation.js";

export function dealVisibilitySql(actor: AnalyticsActor) {
  const parts: Prisma.Sql[] = [Prisma.sql`d.organization_id = ${actor.organizationId}::uuid`];
  if (!hasTeamVisibility(actor.role)) {
    parts.push(Prisma.sql`d.owner_id = ${actor.userId}::uuid`);
  }
  return Prisma.join(parts, " AND ");
}

export function dealFilterSql(filters: ResolvedAnalyticsFilters) {
  const parts: Prisma.Sql[] = [];
  if (filters.ownerId) parts.push(Prisma.sql`d.owner_id = ${filters.ownerId}::uuid`);
  if (filters.pipelineId) parts.push(Prisma.sql`d.pipeline_id = ${filters.pipelineId}::uuid`);
  if (filters.department) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = d.organization_id
        AND om.user_id = d.owner_id
        AND om.department = ${filters.department}::"Department"
    )`);
  }
  if (parts.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(parts, " AND ");
}

export function dealWhereSql(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters) {
  return Prisma.sql`${dealVisibilitySql(actor)} AND ${dealFilterSql(filters)}`;
}

export const LEAD_STAGE_SQL = Prisma.sql`(s.key = 'lead' OR (s.key IS NULL AND lower(s.name) = 'lead'))`;

export const OPEN_STAGE_SQL = Prisma.sql`s.is_won = FALSE AND s.is_lost = FALSE`;

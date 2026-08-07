import { Prisma, type Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { decimalToNumber, likePattern, parseDealListFilters, parsePerStage } from "../../lib/deal.js";
import { hasTeamVisibility } from "../../services/authorization.service.js";
import { fail } from "../../utils/errors.js";
import { scopedWhere } from "../../lib/tenant-scope.js";

type Actor = { organizationId: string; userId: string; role: Role };

const DEAL_SELECT = {
  id: true,
  name: true,
  amount: true,
  currency: true,
  probability: true,
  expectedCloseDate: true,
  stageId: true,
  ownerId: true,
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.DealSelect;

function dealBoardConditions(actor: Actor, pipelineId: string, query: Record<string, unknown>) {
  const filters = parseDealListFilters(query);
  const conditions: Prisma.Sql[] = [
    Prisma.sql`d.organization_id = ${actor.organizationId}::uuid`,
    Prisma.sql`d.pipeline_id = ${pipelineId}::uuid`,
  ];
  if (!hasTeamVisibility(actor.role)) {
    conditions.push(Prisma.sql`d.owner_id = ${actor.userId}::uuid`);
  }
  if (filters.ownerId) conditions.push(Prisma.sql`d.owner_id = ${filters.ownerId}::uuid`);
  if (filters.companyId) conditions.push(Prisma.sql`d.company_id = ${filters.companyId}::uuid`);
  if (filters.stageId) conditions.push(Prisma.sql`d.stage_id = ${filters.stageId}::uuid`);
  if (filters.minAmount) conditions.push(Prisma.sql`d.amount >= ${filters.minAmount}`);
  if (filters.maxAmount) conditions.push(Prisma.sql`d.amount <= ${filters.maxAmount}`);
  if (filters.closeDateFrom) conditions.push(Prisma.sql`d.expected_close_date >= ${filters.closeDateFrom}`);
  if (filters.closeDateTo) conditions.push(Prisma.sql`d.expected_close_date <= ${filters.closeDateTo}`);
  if (filters.search) {
    const pattern = likePattern(filters.search);
    conditions.push(
      Prisma.sql`(d.name ILIKE ${pattern} ESCAPE '\\' OR c.name ILIKE ${pattern} ESCAPE '\\' OR pc.first_name ILIKE ${pattern} ESCAPE '\\' OR pc.last_name ILIKE ${pattern} ESCAPE '\\' OR pc.email ILIKE ${pattern} ESCAPE '\\')`,
    );
  }
  return Prisma.join(conditions, " AND ");
}

function numberish(value: unknown) {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export async function pipelineSummary(actor: Actor, pipelineId: string, query: Record<string, unknown>) {
  const pipeline = await prisma.pipeline.findFirst({
    where: scopedWhere(actor.organizationId, { id: pipelineId }),
  });
  if (!pipeline) throw fail(404, "PIPELINE_NOT_FOUND", "Pipeline not found");

  const [stages, grouped] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { organizationId: actor.organizationId, pipelineId },
      orderBy: { order: "asc" },
    }),
    prisma.$queryRaw<Array<{ stage_id: string; deal_count: unknown; total_amount: unknown; weighted: unknown }>>`
      SELECT d.stage_id,
             COUNT(*)::int AS deal_count,
             COALESCE(SUM(d.amount), 0) AS total_amount,
             COALESCE(SUM(d.amount * COALESCE(d.probability, 0) / 100.0), 0) AS weighted
      FROM deals d
      LEFT JOIN companies c ON c.id = d.company_id
      LEFT JOIN contacts pc ON pc.id = d.primary_contact_id
      WHERE ${dealBoardConditions(actor, pipelineId, query)}
      GROUP BY d.stage_id
    `,
  ]);

  const byStage = new Map(grouped.map((row) => [row.stage_id, row]));
  const stageRows = stages.map((stage) => {
    const agg = byStage.get(stage.id);
    return {
      stageId: stage.id,
      stageName: stage.name,
      dealCount: numberish(agg?.deal_count),
      totalAmount: numberish(agg?.total_amount),
      weightedValue: Math.round(numberish(agg?.weighted)),
    };
  });

  const overall = stageRows.reduce(
    (acc, row) => ({
      dealCount: acc.dealCount + row.dealCount,
      totalAmount: acc.totalAmount + row.totalAmount,
      weightedValue: acc.weightedValue + row.weightedValue,
    }),
    { dealCount: 0, totalAmount: 0, weightedValue: 0 },
  );

  return { stages: stageRows, overall };
}

export async function pipelineKanban(actor: Actor, pipelineId: string, query: Record<string, unknown>) {
  const pipeline = await prisma.pipeline.findFirst({
    where: scopedWhere(actor.organizationId, { id: pipelineId }),
  });
  if (!pipeline) throw fail(404, "PIPELINE_NOT_FOUND", "Pipeline not found");

  const perStage = parsePerStage(query);
  const whereSql = dealBoardConditions(actor, pipelineId, query);

  const [stages, ranked, grouped] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { organizationId: actor.organizationId, pipelineId },
      orderBy: { order: "asc" },
    }),
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT ranked.id
      FROM (
        SELECT d.id,
               ROW_NUMBER() OVER (PARTITION BY d.stage_id ORDER BY d.updated_at DESC) AS rn
        FROM deals d
        LEFT JOIN companies c ON c.id = d.company_id
        LEFT JOIN contacts pc ON pc.id = d.primary_contact_id
        WHERE ${whereSql}
      ) ranked
      WHERE ranked.rn <= ${perStage}
    `,
    prisma.$queryRaw<Array<{ stage_id: string; deal_count: unknown; total_amount: unknown; weighted: unknown }>>`
      SELECT d.stage_id,
             COUNT(*)::int AS deal_count,
             COALESCE(SUM(d.amount), 0) AS total_amount,
             COALESCE(SUM(d.amount * COALESCE(d.probability, 0) / 100.0), 0) AS weighted
      FROM deals d
      LEFT JOIN companies c ON c.id = d.company_id
      LEFT JOIN contacts pc ON pc.id = d.primary_contact_id
      WHERE ${whereSql}
      GROUP BY d.stage_id
    `,
  ]);

  const deals =
    ranked.length === 0
      ? []
      : await prisma.deal.findMany({
          where: { organizationId: actor.organizationId, id: { in: ranked.map((row) => row.id) } },
          select: DEAL_SELECT,
        });

  type KanbanDeal = Omit<(typeof deals)[number], "amount"> & { amount: number | null };
  const dealsByStage = new Map<string, KanbanDeal[]>();
  for (const stage of stages) dealsByStage.set(stage.id, []);
  const order = new Map(ranked.map((row, index) => [row.id, index]));
  for (const deal of [...deals].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
    const bucket = dealsByStage.get(deal.stageId);
    if (bucket) bucket.push({ ...deal, amount: decimalToNumber(deal.amount) });
  }

  const aggByStage = new Map(grouped.map((row) => [row.stage_id, row]));

  return {
    pipeline: { id: pipeline.id, name: pipeline.name },
    perStage,
    stages: stages.map((stage) => {
      const agg = aggByStage.get(stage.id);
      const dealCount = numberish(agg?.deal_count);
      const cards = dealsByStage.get(stage.id) ?? [];
      return {
        id: stage.id,
        name: stage.name,
        position: stage.order,
        probability: stage.probability,
        isWon: stage.isWon,
        isLost: stage.isLost,
        dealCount,
        totalAmount: numberish(agg?.total_amount),
        weightedValue: Math.round(numberish(agg?.weighted)),
        hasMore: dealCount > cards.length,
        deals: cards,
      };
    }),
  };
}

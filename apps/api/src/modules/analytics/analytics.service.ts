import type {
  AnalyticsLeaderboard,
  AnalyticsOverview,
  AnalyticsPipeline,
  AnalyticsRevenue,
  AnalyticsWinRate,
} from "@crm/types";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { collapseCurrencies, countInt, moneyString, orgCurrencyAmount, trendPercent, winRate } from "../../lib/analytics-math.js";
import { addCalendarDays, enumeratePeriods, postgresPeriodFormat, todayYmd, zonedStartUtc } from "../../lib/analytics-timezone.js";
import { activityScope, hasTeamVisibility, taskScope } from "../../services/authorization.service.js";
import { dealWhereSql, LEAD_STAGE_SQL, OPEN_STAGE_SQL } from "./analytics.queries.js";
import { periodDto, type AnalyticsActor, type ResolvedAnalyticsFilters } from "./analytics.validation.js";

type CurrencyAmountRow = { currency: string; amount: unknown; weighted?: unknown; deal_count?: unknown };
type CountRow = { won?: unknown; lost?: unknown; open_count?: unknown; lead_count?: unknown };
type SeriesRow = { period: string; currency?: string; amount?: unknown; won?: unknown; lost?: unknown };
type OwnerMoneyRow = { owner_id: string; currency: string; amount: unknown; deals_won?: unknown };

async function revenueByCurrency(
  actor: AnalyticsActor,
  filters: ResolvedAnalyticsFilters,
  fromUtc: Date,
  toUtc: Date,
) {
  const rows = await prisma.$queryRaw<CurrencyAmountRow[]>`
    SELECT d.currency, COALESCE(SUM(d.amount), 0) AS amount
    FROM deals d
    INNER JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhereSql(actor, filters)}
      AND s.is_won = TRUE
      AND d.won_at >= ${fromUtc}
      AND d.won_at < ${toUtc}
    GROUP BY d.currency
  `;
  return collapseCurrencies(rows, filters.orgCurrency);
}

async function closedCounts(
  actor: AnalyticsActor,
  filters: ResolvedAnalyticsFilters,
  fromUtc: Date,
  toUtc: Date,
) {
  const [row] = await prisma.$queryRaw<CountRow[]>`
    SELECT
      COUNT(*) FILTER (WHERE s.is_won = TRUE AND d.won_at >= ${fromUtc} AND d.won_at < ${toUtc})::int AS won,
      COUNT(*) FILTER (WHERE s.is_lost = TRUE AND d.lost_at >= ${fromUtc} AND d.lost_at < ${toUtc})::int AS lost
    FROM deals d
    INNER JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhereSql(actor, filters)}
  `;
  return { won: countInt(row?.won), lost: countInt(row?.lost) };
}

async function currentOpenAndLeads(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters) {
  const [row] = await prisma.$queryRaw<CountRow[]>`
    SELECT
      COUNT(*) FILTER (WHERE ${OPEN_STAGE_SQL})::int AS open_count,
      COUNT(*) FILTER (WHERE ${OPEN_STAGE_SQL} AND ${LEAD_STAGE_SQL})::int AS lead_count
    FROM deals d
    INNER JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhereSql(actor, filters)}
  `;
  return { openDeals: countInt(row?.open_count), leads: countInt(row?.lead_count) };
}

async function pipelineMoney(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters, weighted = false) {
  const rows = await prisma.$queryRaw<CurrencyAmountRow[]>`
    SELECT
      d.currency,
      COALESCE(SUM(d.amount), 0) AS amount,
      COALESCE(SUM(d.amount * COALESCE(d.probability, 0) / 100.0), 0) AS weighted
    FROM deals d
    INNER JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhereSql(actor, filters)}
      AND ${OPEN_STAGE_SQL}
      AND d.expected_close_date >= ${filters.fromYmd}::date
      AND d.expected_close_date < ${filters.exclusiveToYmd}::date
    GROUP BY d.currency
  `;
  if (weighted) {
    return collapseCurrencies(
      rows.map((row) => ({ currency: row.currency, amount: row.weighted })),
      filters.orgCurrency,
    );
  }
  return collapseCurrencies(rows, filters.orgCurrency);
}

function taskWhere(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters) {
  return {
    organizationId: actor.organizationId,
    ...taskScope(actor.role, actor.userId),
    ...(filters.ownerId ? { assigneeId: filters.ownerId } : {}),
    ...(filters.department
      ? {
          assignee: {
            memberships: { some: { organizationId: actor.organizationId, department: filters.department } },
          },
        }
      : {}),
  } satisfies Prisma.TaskWhereInput;
}

async function followUpCounts(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters, now: Date) {
  const where = taskWhere(actor, filters);
  const today = todayYmd(filters.timeZone, now);
  const todayStart = zonedStartUtc(today, filters.timeZone);
  const todayEnd = zonedStartUtc(addCalendarDays(today, 1), filters.timeZone);
  const [open, overdue, dueToday] = await Promise.all([
    prisma.task.count({
      where: { ...where, status: "OPEN" },
    }),
    prisma.task.count({
      where: { ...where, status: "OPEN", dueDate: { lt: now } },
    }),
    prisma.task.count({
      where: { ...where, status: "OPEN", dueDate: { gte: todayStart, lt: todayEnd } },
    }),
  ]);
  return { open, overdue, dueToday };
}

async function recentActivity(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters) {
  const items = await prisma.activity.findMany({
    where: {
      organizationId: actor.organizationId,
      ...activityScope(actor.role, actor.userId),
      ...(filters.ownerId ? { authorId: filters.ownerId } : {}),
      ...(filters.department
        ? {
            author: {
              memberships: { some: { organizationId: actor.organizationId, department: filters.department } },
            },
          }
        : {}),
    },
    include: {
      author: { select: { id: true, fullName: true } },
      deal: { select: { id: true, name: true } },
      company: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { occurredAt: "desc" },
    take: 10,
  });

  return items.map((row) => ({
    id: row.id,
    type: row.type,
    content: row.content,
    occurredAt: row.occurredAt.toISOString(),
    author: row.author,
    deal: row.deal,
    company: row.company,
    contact: row.contact,
    metadata: row.metadata,
  }));
}

export async function getOverview(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters): Promise<AnalyticsOverview> {
  const now = new Date();
  const [
    revenue,
    previousRevenue,
    closed,
    previousClosed,
    snapshot,
    pipelineValue,
    weightedPipelineValue,
    followUps,
    activity,
  ] = await Promise.all([
    revenueByCurrency(actor, filters, filters.fromUtc, filters.toUtc),
    revenueByCurrency(actor, filters, filters.previous.fromUtc, filters.previous.toUtc),
    closedCounts(actor, filters, filters.fromUtc, filters.toUtc),
    closedCounts(actor, filters, filters.previous.fromUtc, filters.previous.toUtc),
    currentOpenAndLeads(actor, filters),
    pipelineMoney(actor, filters, false),
    pipelineMoney(actor, filters, true),
    followUpCounts(actor, filters, now),
    recentActivity(actor, filters),
  ]);

  const rate = winRate(closed.won, closed.lost);
  const previousRate = winRate(previousClosed.won, previousClosed.lost);
  const revenueTrend = revenue.mixed || previousRevenue.mixed
    ? { percent: null, hasComparison: false }
    : trendPercent(orgCurrencyAmount(revenue, filters.orgCurrency), orgCurrencyAmount(previousRevenue, filters.orgCurrency));
  const winTrend =
    rate.hasData && previousRate.hasData && previousRate.value !== 0
      ? trendPercent(rate.value, previousRate.value)
      : { percent: null, hasComparison: false };

  return {
    period: periodDto(filters),
    previousPeriod: periodDto({
      fromYmd: filters.previous.fromYmd,
      toYmd: filters.previous.toYmd,
      exclusiveToYmd: filters.previous.exclusiveToYmd,
      timeZone: filters.timeZone,
    }),
    metrics: {
      revenue: { ...revenue, trend: revenueTrend },
      openDeals: snapshot.openDeals,
      leads: snapshot.leads,
      winRate: { ...rate, trend: winTrend },
      pipelineValue,
      weightedPipelineValue,
      followUps,
    },
    recentActivity: activity,
  };
}

export async function getPipeline(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters): Promise<AnalyticsPipeline> {
  const pipeline = filters.pipelineId
    ? await prisma.pipeline.findFirst({
        where: { organizationId: actor.organizationId, id: filters.pipelineId },
        include: { stages: { orderBy: { order: "asc" } } },
      })
    : await prisma.pipeline.findFirst({
        where: { organizationId: actor.organizationId },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        include: { stages: { orderBy: { order: "asc" } } },
      });

  if (!pipeline) {
    return { period: periodDto(filters), pipeline: null, stages: [] };
  }

  const rows = await prisma.$queryRaw<
    Array<{
      stage_id: string;
      currency: string;
      deal_count: unknown;
      amount: unknown;
      weighted: unknown;
    }>
  >`
    SELECT
      d.stage_id,
      d.currency,
      COUNT(*)::int AS deal_count,
      COALESCE(SUM(d.amount), 0) AS amount,
      COALESCE(SUM(d.amount * COALESCE(d.probability, 0) / 100.0), 0) AS weighted
    FROM deals d
    INNER JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhereSql(actor, filters)}
      AND d.pipeline_id = ${pipeline.id}::uuid
      AND (
        (${OPEN_STAGE_SQL} AND d.expected_close_date >= ${filters.fromYmd}::date AND d.expected_close_date < ${filters.exclusiveToYmd}::date)
        OR (s.is_won = TRUE AND d.won_at >= ${filters.fromUtc} AND d.won_at < ${filters.toUtc})
        OR (s.is_lost = TRUE AND d.lost_at >= ${filters.fromUtc} AND d.lost_at < ${filters.toUtc})
      )
    GROUP BY d.stage_id, d.currency
  `;

  const byStage = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byStage.get(row.stage_id) ?? [];
    list.push(row);
    byStage.set(row.stage_id, list);
  }

  const stages = pipeline.stages.map((stage) => {
    const stageRows = byStage.get(stage.id) ?? [];
    const money = collapseCurrencies(stageRows, filters.orgCurrency);
    const weighted = collapseCurrencies(
      stageRows.map((row) => ({ currency: row.currency, amount: row.weighted })),
      filters.orgCurrency,
    );
    const dealCount = stageRows.reduce((sum, row) => sum + countInt(row.deal_count), 0);
    return {
      stageId: stage.id,
      pipelineId: pipeline.id,
      name: stage.name,
      key: stage.key,
      position: stage.order,
      isWon: stage.isWon,
      isLost: stage.isLost,
      dealCount,
      amount: money.amount,
      weightedAmount: weighted.amount,
      currency: money.mixed ? filters.orgCurrency : money.currency,
      mixed: money.mixed,
      byCurrency: stageRows.map((row) => ({
        currency: row.currency,
        amount: moneyString(row.amount),
        weightedAmount: moneyString(row.weighted),
      })),
    };
  });

  return {
    period: periodDto(filters),
    pipeline: { id: pipeline.id, name: pipeline.name },
    stages,
  };
}

export async function getRevenue(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters): Promise<AnalyticsRevenue> {
  const format = postgresPeriodFormat(filters.groupBy);
  const rows = await prisma.$queryRaw<SeriesRow[]>`
    SELECT to_char(d.won_at AT TIME ZONE ${filters.timeZone}, ${format}) AS period,
           d.currency,
           COALESCE(SUM(d.amount), 0) AS amount
    FROM deals d
    INNER JOIN pipeline_stages s ON s.id = d.stage_id
    WHERE ${dealWhereSql(actor, filters)}
      AND s.is_won = TRUE
      AND d.won_at >= ${filters.fromUtc}
      AND d.won_at < ${filters.toUtc}
    GROUP BY 1, 2
    ORDER BY 1
  `;

  const grouped = new Map<string, Array<{ currency: string; amount: unknown }>>();
  for (const row of rows) {
    const list = grouped.get(row.period) ?? [];
    list.push({ currency: row.currency ?? filters.orgCurrency, amount: row.amount });
    grouped.set(row.period, list);
  }

  const periods = enumeratePeriods(filters.fromYmd, filters.toYmd, filters.groupBy);
  const series = periods.map((period) => {
    const collapsed = collapseCurrencies(grouped.get(period) ?? [], filters.orgCurrency);
    return {
      period,
      amount: collapsed.mixed
        ? orgCurrencyAmount(collapsed, filters.orgCurrency)
        : (collapsed.amount ?? "0.00"),
      byCurrency: collapsed.byCurrency,
    };
  });

  const total = collapseCurrencies(
    rows.map((row) => ({ currency: row.currency ?? filters.orgCurrency, amount: row.amount })),
    filters.orgCurrency,
  );

  return {
    period: periodDto(filters),
    currency: total.mixed ? filters.orgCurrency : total.currency,
    mixed: total.mixed,
    total: total.amount,
    groupBy: filters.groupBy,
    series,
  };
}

export async function getWinRate(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters): Promise<AnalyticsWinRate> {
  const format = postgresPeriodFormat(filters.groupBy);
  const closed = await closedCounts(actor, filters, filters.fromUtc, filters.toUtc);
  const rate = winRate(closed.won, closed.lost);

  const rows = await prisma.$queryRaw<SeriesRow[]>`
    SELECT period, SUM(won)::int AS won, SUM(lost)::int AS lost
    FROM (
      SELECT to_char(d.won_at AT TIME ZONE ${filters.timeZone}, ${format}) AS period,
             1 AS won,
             0 AS lost
      FROM deals d
      INNER JOIN pipeline_stages s ON s.id = d.stage_id
      WHERE ${dealWhereSql(actor, filters)}
        AND s.is_won = TRUE
        AND d.won_at >= ${filters.fromUtc}
        AND d.won_at < ${filters.toUtc}
      UNION ALL
      SELECT to_char(d.lost_at AT TIME ZONE ${filters.timeZone}, ${format}) AS period,
             0 AS won,
             1 AS lost
      FROM deals d
      INNER JOIN pipeline_stages s ON s.id = d.stage_id
      WHERE ${dealWhereSql(actor, filters)}
        AND s.is_lost = TRUE
        AND d.lost_at >= ${filters.fromUtc}
        AND d.lost_at < ${filters.toUtc}
    ) closed
    GROUP BY period
    ORDER BY period
  `;

  const byPeriod = new Map(rows.map((row) => [row.period, { won: countInt(row.won), lost: countInt(row.lost) }]));
  const series = enumeratePeriods(filters.fromYmd, filters.toYmd, filters.groupBy).map((period) => {
    const point = byPeriod.get(period) ?? { won: 0, lost: 0 };
    const metric = winRate(point.won, point.lost);
    return { period, won: metric.won, lost: metric.lost, winRate: metric.value, hasData: metric.hasData };
  });

  return {
    period: periodDto(filters),
    won: closed.won,
    lost: closed.lost,
    winRate: rate.value,
    hasData: rate.hasData,
    groupBy: filters.groupBy,
    series,
  };
}

export async function getLeaderboard(actor: AnalyticsActor, filters: ResolvedAnalyticsFilters): Promise<AnalyticsLeaderboard> {
  const memberWhere: Prisma.OrganizationMemberWhereInput = {
    organizationId: actor.organizationId,
    status: "ACTIVE",
    ...(filters.ownerId ? { userId: filters.ownerId } : {}),
    ...(filters.department ? { department: filters.department } : {}),
  };
  if (!hasTeamVisibility(actor.role)) {
    memberWhere.userId = actor.userId;
  }

  const [members, wonRows, pipelineRows] = await Promise.all([
    prisma.organizationMember.findMany({
      where: memberWhere,
      include: { user: { select: { id: true, fullName: true } } },
    }),
    prisma.$queryRaw<OwnerMoneyRow[]>`
      SELECT d.owner_id, d.currency, COUNT(*)::int AS deals_won, COALESCE(SUM(d.amount), 0) AS amount
      FROM deals d
      INNER JOIN pipeline_stages s ON s.id = d.stage_id
      WHERE ${dealWhereSql(actor, filters)}
        AND s.is_won = TRUE
        AND d.won_at >= ${filters.fromUtc}
        AND d.won_at < ${filters.toUtc}
      GROUP BY d.owner_id, d.currency
    `,
    prisma.$queryRaw<OwnerMoneyRow[]>`
      SELECT d.owner_id, d.currency, COALESCE(SUM(d.amount), 0) AS amount
      FROM deals d
      INNER JOIN pipeline_stages s ON s.id = d.stage_id
      WHERE ${dealWhereSql(actor, filters)}
        AND ${OPEN_STAGE_SQL}
        AND d.expected_close_date >= ${filters.fromYmd}::date
        AND d.expected_close_date < ${filters.exclusiveToYmd}::date
      GROUP BY d.owner_id, d.currency
    `,
  ]);

  const wonByOwner = new Map<string, OwnerMoneyRow[]>();
  const pipelineByOwner = new Map<string, OwnerMoneyRow[]>();
  for (const row of wonRows) {
    const list = wonByOwner.get(row.owner_id) ?? [];
    list.push(row);
    wonByOwner.set(row.owner_id, list);
  }
  for (const row of pipelineRows) {
    const list = pipelineByOwner.get(row.owner_id) ?? [];
    list.push(row);
    pipelineByOwner.set(row.owner_id, list);
  }

  const mapped = members.map((member) => {
    const won = wonByOwner.get(member.userId) ?? [];
    const open = pipelineByOwner.get(member.userId) ?? [];
    const revenue = collapseCurrencies(won, filters.orgCurrency);
    const pipeline = collapseCurrencies(open, filters.orgCurrency);
    const dealsWon = won.reduce((sum, row) => sum + countInt(row.deals_won), 0);
    const mixed = revenue.mixed || pipeline.mixed;
    return {
      userId: member.userId,
      name: member.user.fullName,
      dealsWon,
      revenue: revenue.amount,
      openPipeline: pipeline.amount,
      currency: mixed ? filters.orgCurrency : revenue.currency,
      mixed,
      revenueByCurrency: revenue.byCurrency,
      pipelineByCurrency: pipeline.byCurrency,
      _sortRevenue: Number(orgCurrencyAmount(revenue, filters.orgCurrency)),
      _sortPipeline: Number(orgCurrencyAmount(pipeline, filters.orgCurrency)),
    };
  });

  mapped.sort((a, b) => {
    if (filters.sortBy === "dealsWon") return b.dealsWon - a.dealsWon;
    if (filters.sortBy === "openPipeline") return b._sortPipeline - a._sortPipeline;
    return b._sortRevenue - a._sortRevenue;
  });

  return {
    period: periodDto(filters),
    sortBy: filters.sortBy,
    members: mapped.map(({ _sortRevenue: _r, _sortPipeline: _p, ...member }) => member),
  };
}

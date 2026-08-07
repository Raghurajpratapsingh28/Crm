import type { LostReason, Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  DEAL_SORT,
  decimalToNumber,
  dealSearchWhere,
  parseAmount,
  parseCloseDate,
  parseCurrency,
  parseDealListFilters,
  parseDealName,
  parseLostReasonInput,
  parseProbability,
  probabilityAfterStageChange,
  probabilityForNewDeal,
} from "../../lib/deal.js";
import { paginationMeta, parsePagination, parseSortOrder, resolveOwnerId, whitelistSort } from "../../lib/crm.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { writeAudit } from "../../services/audit.service.js";
import { enqueueNotification } from "../../services/notification.service.js";
import {
  assigneeScope,
  assertVisibleOwned,
  authorScope,
  canAssignResource,
  ownerScope,
} from "../../services/authorization.service.js";
import { fail, forbidden } from "../../utils/errors.js";

type Actor = { organizationId: string; userId: string; role: Role };

const CARD_INCLUDE = {
  company: { select: { id: true, name: true } },
  primaryContact: { select: { id: true, firstName: true, lastName: true, email: true } },
  owner: { select: { id: true, fullName: true, email: true } },
  stage: { select: { id: true, name: true, order: true, probability: true, isWon: true, isLost: true } },
  pipeline: { select: { id: true, name: true } },
} satisfies Prisma.DealInclude;

function mapDeal(deal: Prisma.DealGetPayload<{ include: typeof CARD_INCLUDE }>) {
  return {
    id: deal.id,
    organizationId: deal.organizationId,
    name: deal.name,
    description: deal.description,
    companyId: deal.companyId,
    primaryContactId: deal.primaryContactId,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    ownerId: deal.ownerId,
    amount: decimalToNumber(deal.amount),
    currency: deal.currency,
    expectedCloseDate: deal.expectedCloseDate,
    probability: deal.probability,
    probabilitySource: deal.probabilitySource,
    lostReason: deal.lostReason,
    lostReasonNote: deal.lostReasonNote,
    wonAt: deal.wonAt,
    lostAt: deal.lostAt,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    company: deal.company,
    primaryContact: deal.primaryContact,
    owner: deal.owner,
    stage: deal.stage,
    pipeline: deal.pipeline,
  };
}

async function lockDeal(tx: Prisma.TransactionClient, organizationId: string, dealId: string) {
  await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
  const deal = await tx.deal.findFirst({ where: scopedWhere(organizationId, { id: dealId }) });
  if (!deal) throw fail(404, "DEAL_NOT_FOUND", "Deal not found");
  return deal;
}

async function assertCompanyContact(
  organizationId: string,
  companyId: string,
  primaryContactId: string,
) {
  const [company, contact] = await Promise.all([
    prisma.company.findFirst({ where: scopedWhere(organizationId, { id: companyId }) }),
    prisma.contact.findFirst({ where: scopedWhere(organizationId, { id: primaryContactId }) }),
  ]);
  if (!company) throw fail(400, "INVALID_COMPANY", "company must belong to this organization");
  if (!contact) throw fail(400, "INVALID_CONTACT", "contact must belong to this organization");
  if (contact.companyId && contact.companyId !== company.id) {
    throw fail(400, "INVALID_CONTACT", "primary contact must belong to the selected company");
  }
  return { company, contact };
}

export type TransitionFailPoint = "history" | "activity" | "audit" | "notify";

let failNextTransition: TransitionFailPoint | null = null;

/** Test-only hook to simulate a mid-transaction failure. */
export function failNextDealTransition(point: TransitionFailPoint | null) {
  failNextTransition = point;
}

function maybeFail(point: TransitionFailPoint) {
  if (failNextTransition === point) {
    failNextTransition = null;
    throw new Error(`simulated ${point} failure`);
  }
}

export async function listDeals(actor: Actor, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const sortBy = whitelistSort(query.sortBy ?? query.sort, DEAL_SORT, "updatedAt");
  const sortOrder = parseSortOrder(query.sortOrder ?? query.order);
  const filters = parseDealListFilters(query);

  const where: Prisma.DealWhereInput = {
    organizationId: actor.organizationId,
    ...ownerScope(actor.role, actor.userId),
    ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
    ...(filters.companyId ? { companyId: filters.companyId } : {}),
    ...(filters.pipelineId ? { pipelineId: filters.pipelineId } : {}),
    ...(filters.stageId ? { stageId: filters.stageId } : {}),
    ...(filters.minAmount || filters.maxAmount
      ? {
          amount: {
            ...(filters.minAmount ? { gte: filters.minAmount } : {}),
            ...(filters.maxAmount ? { lte: filters.maxAmount } : {}),
          },
        }
      : {}),
    ...(filters.closeDateFrom || filters.closeDateTo
      ? {
          expectedCloseDate: {
            ...(filters.closeDateFrom ? { gte: filters.closeDateFrom } : {}),
            ...(filters.closeDateTo ? { lte: filters.closeDateTo } : {}),
          },
        }
      : {}),
    ...(filters.search ? { OR: dealSearchWhere(filters.search) } : {}),
  };

  const [total, items] = await prisma.$transaction([
    prisma.deal.count({ where }),
    prisma.deal.findMany({
      where,
      include: CARD_INCLUDE,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
  ]);

  return { items: items.map(mapDeal), pagination: paginationMeta(page, limit, total) };
}

export async function getDeal(actor: Actor, id: string) {
  const deal = await prisma.deal.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
    include: {
      ...CARD_INCLUDE,
      stageHistory: {
        orderBy: { changedAt: "asc" },
        include: {
          fromStage: { select: { id: true, name: true } },
          toStage: { select: { id: true, name: true } },
          changedBy: { select: { id: true, fullName: true } },
        },
      },
      activities: {
        where: { ...authorScope(actor.role, actor.userId) },
        orderBy: { occurredAt: "desc" },
        take: 50,
        include: { author: { select: { id: true, fullName: true } } },
      },
      tasks: {
        where: { ...assigneeScope(actor.role, actor.userId) },
        orderBy: { dueDate: "asc" },
        take: 50,
      },
    },
  });
  if (!deal) throw fail(404, "DEAL_NOT_FOUND", "Deal not found");
  assertVisibleOwned(actor.role, actor.userId, deal.ownerId);
  return {
    ...mapDeal(deal),
    stageHistory: deal.stageHistory,
    activities: deal.activities,
    tasks: deal.tasks,
  };
}

export async function createDeal(actor: Actor, body: Record<string, unknown>) {
  const name = parseDealName(body.name);
  const companyId = String(body.companyId ?? "");
  const primaryContactId = String(body.primaryContactId ?? "");
  if (!companyId || !primaryContactId) throw fail(400, "INVALID", "companyId and primaryContactId are required");

  await assertCompanyContact(actor.organizationId, companyId, primaryContactId);

  const pipeline =
    body.pipelineId
      ? await prisma.pipeline.findFirst({
          where: scopedWhere(actor.organizationId, { id: String(body.pipelineId) }),
          include: { stages: { orderBy: { order: "asc" } } },
        })
      : await prisma.pipeline.findFirst({
          where: { organizationId: actor.organizationId, isDefault: true },
          include: { stages: { orderBy: { order: "asc" } } },
        }) ??
        (await prisma.pipeline.findFirst({
          where: { organizationId: actor.organizationId },
          include: { stages: { orderBy: { order: "asc" } } },
        }));

  if (!pipeline) throw fail(404, "PIPELINE_NOT_FOUND", "Pipeline not found");

  const stage = body.stageId
    ? pipeline.stages.find((row) => row.id === String(body.stageId))
    : pipeline.stages[0];
  if (!stage) throw fail(400, "STAGE_NOT_FOUND", "Stage not found for this pipeline");

  const ownerId = await resolveOwnerId({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    role: actor.role,
    requestedOwnerId: body.ownerId as string | undefined,
  });

  const suppliedProbability = parseProbability(body.probability);
  const { probability, probabilitySource } = probabilityForNewDeal(stage.probability, suppliedProbability);

  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        organizationId: actor.organizationId,
        name,
        description: body.description ? String(body.description).trim() || null : null,
        companyId,
        primaryContactId,
        pipelineId: pipeline.id,
        stageId: stage.id,
        ownerId,
        amount: parseAmount(body.amount) ?? null,
        currency: parseCurrency(body.currency),
        expectedCloseDate: parseCloseDate(body.expectedCloseDate) ?? null,
        probability,
        probabilitySource,
        ...(stage.isWon ? { wonAt: new Date(), probability: 100 } : {}),
        ...(stage.isLost ? { lostAt: new Date(), probability: 0 } : {}),
      },
      include: CARD_INCLUDE,
    });

    await tx.dealStageHistory.create({
      data: {
        organizationId: actor.organizationId,
        dealId: created.id,
        fromStageId: null,
        toStageId: stage.id,
        changedByUserId: actor.userId,
        fromProbability: null,
        toProbability: created.probability,
      },
    });

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "DEAL_CREATED",
      entityType: "deals",
      entityId: created.id,
      metadata: { name: created.name, stage: stage.name },
    });

    return created;
  });

  return mapDeal(deal);
}

export async function updateDeal(actor: Actor, id: string, body: Record<string, unknown>) {
  const existing = await prisma.deal.findFirst({ where: scopedWhere(actor.organizationId, { id }) });
  if (!existing) throw fail(404, "DEAL_NOT_FOUND", "Deal not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  let companyId = existing.companyId;
  let primaryContactId = existing.primaryContactId;
  if (body.companyId !== undefined) companyId = String(body.companyId);
  if (body.primaryContactId !== undefined) primaryContactId = String(body.primaryContactId);
  if (body.companyId !== undefined || body.primaryContactId !== undefined) {
    await assertCompanyContact(actor.organizationId, companyId, primaryContactId);
  }

  const nextOwnerId =
    body.ownerId !== undefined
      ? await resolveOwnerId({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          role: actor.role,
          requestedOwnerId: String(body.ownerId),
        })
      : existing.ownerId;

  if (body.ownerId !== undefined && !canAssignResource(actor.role) && nextOwnerId !== actor.userId) {
    throw forbidden();
  }

  const suppliedProbability = parseProbability(body.probability);
  let probability = existing.probability;
  let probabilitySource = existing.probabilitySource;
  if (suppliedProbability !== undefined) {
    probability = suppliedProbability;
    probabilitySource = "MANUAL";
  }

  const updated = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: parseDealName(body.name) } : {}),
        ...(body.description !== undefined ? { description: String(body.description ?? "").trim() || null } : {}),
        ...(body.companyId !== undefined ? { companyId } : {}),
        ...(body.primaryContactId !== undefined ? { primaryContactId } : {}),
        ...(body.ownerId !== undefined ? { ownerId: nextOwnerId } : {}),
        ...(body.amount !== undefined ? { amount: parseAmount(body.amount) } : {}),
        ...(body.currency !== undefined ? { currency: parseCurrency(body.currency, existing.currency) } : {}),
        ...(body.expectedCloseDate !== undefined ? { expectedCloseDate: parseCloseDate(body.expectedCloseDate) } : {}),
        ...(suppliedProbability !== undefined ? { probability, probabilitySource } : {}),
      },
      include: CARD_INCLUDE,
    });

    if (body.ownerId !== undefined && nextOwnerId !== existing.ownerId) {
      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "DEAL_OWNER_CHANGED",
        entityType: "deals",
        entityId: deal.id,
        metadata: { fromOwnerId: existing.ownerId, toOwnerId: nextOwnerId },
      });
      await enqueueNotification(tx, {
        organizationId: actor.organizationId,
        userId: nextOwnerId,
        type: "LEAD_ASSIGNED",
        payload: { dealId: deal.id, name: deal.name, fromOwnerId: existing.ownerId, toOwnerId: nextOwnerId },
        skipUserId: actor.userId,
      });
    } else if (suppliedProbability !== undefined && suppliedProbability !== existing.probability) {
      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "DEAL_PROBABILITY_CHANGED",
        entityType: "deals",
        entityId: deal.id,
        metadata: { from: existing.probability, to: suppliedProbability },
      });
    } else {
      await writeAudit(tx, {
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "DEAL_UPDATED",
        entityType: "deals",
        entityId: deal.id,
        metadata: { name: deal.name },
      });
    }

    return deal;
  });

  return mapDeal(updated);
}

export async function deleteDeal(actor: Actor, id: string) {
  const existing = await prisma.deal.findFirst({ where: scopedWhere(actor.organizationId, { id }) });
  if (!existing) throw fail(404, "DEAL_NOT_FOUND", "Deal not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "DEAL_DELETED",
      entityType: "deals",
      entityId: existing.id,
      metadata: { name: existing.name },
    });
    await tx.deal.delete({ where: { id: existing.id } });
  });
  return { id: existing.id };
}

export async function resetDealProbability(actor: Actor, id: string) {
  const existing = await prisma.deal.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
    include: { stage: true },
  });
  if (!existing) throw fail(404, "DEAL_NOT_FOUND", "Deal not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  const updated = await prisma.$transaction(async (tx) => {
    const deal = await tx.deal.update({
      where: { id: existing.id },
      data: {
        probability: existing.stage.isWon ? 100 : existing.stage.probability,
        probabilitySource: "STAGE_DEFAULT",
      },
      include: CARD_INCLUDE,
    });
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "DEAL_PROBABILITY_CHANGED",
      entityType: "deals",
      entityId: deal.id,
      metadata: { reset: true, probability: deal.probability },
    });
    return deal;
  });
  return mapDeal(updated);
}

export async function transitionDealStage(
  actor: Actor,
  id: string,
  input: { stageId: string; lostReason?: unknown; resetProbability?: boolean },
) {
  const result = await prisma.$transaction(async (tx) => {
    const locked = await lockDeal(tx, actor.organizationId, id);
    assertVisibleOwned(actor.role, actor.userId, locked.ownerId);

    if (locked.stageId === input.stageId) {
      const current = await tx.deal.findUniqueOrThrow({ where: { id: locked.id }, include: CARD_INCLUDE });
      return { deal: current, noop: true as const };
    }

    const [fromStage, toStage] = await Promise.all([
      tx.pipelineStage.findFirst({ where: scopedWhere(actor.organizationId, { id: locked.stageId }) }),
      tx.pipelineStage.findFirst({
        where: scopedWhere(actor.organizationId, { id: input.stageId, pipelineId: locked.pipelineId }),
      }),
    ]);
    if (!toStage) throw fail(400, "INVALID_STAGE_PIPELINE", "stage must belong to the deal pipeline");
    if (!fromStage) throw fail(400, "STAGE_NOT_FOUND", "Current stage not found");

    let lostReason: LostReason | null = locked.lostReason;
    let lostReasonNote: string | null = locked.lostReasonNote;
    if (toStage.isLost) {
      const parsed = parseLostReasonInput(input.lostReason);
      lostReason = parsed.lostReason;
      lostReasonNote = parsed.lostReasonNote;
    } else {
      lostReason = null;
      lostReasonNote = null;
    }

    const wasWon = Boolean(fromStage.isWon);
    const wasLost = Boolean(fromStage.isLost);
    const prob = probabilityAfterStageChange({
      currentProbability: locked.probability,
      probabilitySource: locked.probabilitySource,
      fromStage,
      toStage,
      resetProbability: input.resetProbability,
    });

    const now = new Date();
    const data: Prisma.DealUpdateInput = {
      stage: { connect: { id: toStage.id } },
      probability: toStage.isWon ? 100 : prob.probability,
      probabilitySource: toStage.isWon ? locked.probabilitySource : prob.probabilitySource,
      lostReason,
      lostReasonNote,
      wonAt: toStage.isWon ? now : null,
      lostAt: toStage.isLost ? now : null,
    };

    const updated = await tx.deal.update({ where: { id: locked.id }, data, include: CARD_INCLUDE });

    await tx.dealStageHistory.create({
      data: {
        organizationId: actor.organizationId,
        dealId: updated.id,
        fromStageId: fromStage.id,
        toStageId: toStage.id,
        changedByUserId: actor.userId,
        fromProbability: locked.probability,
        toProbability: updated.probability,
      },
    });
    maybeFail("history");

    await tx.activity.create({
      data: {
        organizationId: actor.organizationId,
        type: "STATUS_CHANGE",
        authorId: actor.userId,
        dealId: updated.id,
        companyId: updated.companyId,
        contactId: updated.primaryContactId,
        content: `Moved from ${fromStage.name} to ${toStage.name}`,
        metadata: {
          fromStageId: fromStage.id,
          toStageId: toStage.id,
          fromStageName: fromStage.name,
          toStageName: toStage.name,
        },
      },
    });
    maybeFail("activity");

    let auditAction: "DEAL_STAGE_CHANGED" | "DEAL_WON" | "DEAL_LOST" | "DEAL_REOPENED" = "DEAL_STAGE_CHANGED";
    if (toStage.isWon) auditAction = "DEAL_WON";
    else if (toStage.isLost) auditAction = "DEAL_LOST";
    else if (wasWon || wasLost) auditAction = "DEAL_REOPENED";

    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: auditAction,
      entityType: "deals",
      entityId: updated.id,
      metadata: { fromStage: fromStage.name, toStage: toStage.name },
    });
    maybeFail("audit");

    if (toStage.isWon || toStage.isLost || wasWon || wasLost) {
      await enqueueNotification(tx, {
        organizationId: actor.organizationId,
        userId: updated.ownerId,
        type: "DEAL_STAGE_CHANGED",
        payload: {
          dealId: updated.id,
          name: updated.name,
          fromStage: fromStage.name,
          toStage: toStage.name,
          event: auditAction,
        },
        skipUserId: actor.userId,
      });
    }
    maybeFail("notify");

    return { deal: updated, noop: false as const };
  });

  return mapDeal(result.deal);
}

export async function assignDealOwner(actor: Actor, id: string, ownerId: string) {
  if (!canAssignResource(actor.role)) throw forbidden();
  return updateDeal(actor, id, { ownerId });
}

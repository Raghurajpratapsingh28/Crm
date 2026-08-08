import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  contains,
  normalizeNotes,
  normalizeTags,
  normalizeWebsite,
  paginationMeta,
  parseDateBound,
  parseEmployeeCount,
  parseOptionalUuid,
  parsePagination,
  parseSortOrder,
  requiredName,
  resolveOwnerId,
  whitelistSort,
} from "../../lib/crm.js";
import { scopedWhere } from "../../lib/tenant-scope.js";
import { writeAudit } from "../../services/audit.service.js";
import {
  activityScope,
  assertVisibleOwned,
  ownerScope,
  taskScope,
} from "../../services/authorization.service.js";
import { fail } from "../../utils/errors.js";

const COMPANY_SORT: Record<string, "name" | "industry" | "employeeCount" | "createdAt" | "updatedAt"> = {
  name: "name",
  industry: "industry",
  employeeCount: "employeeCount",
  employee_count: "employeeCount",
  createdAt: "createdAt",
  created_at: "createdAt",
  updatedAt: "updatedAt",
  updated_at: "updatedAt",
};

const LIST_INCLUDE = {
  owner: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.CompanyInclude;

type Actor = { organizationId: string; userId: string; role: Role };

function mapCompany(company: Prisma.CompanyGetPayload<{ include: typeof LIST_INCLUDE }>) {
  return {
    id: company.id,
    organizationId: company.organizationId,
    name: company.name,
    industry: company.industry,
    employeeCount: company.employeeCount,
    website: company.website,
    ownerId: company.ownerId,
    tags: company.tags,
    notes: company.notes,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt,
    owner: company.owner,
  };
}

function companyWrite(body: Record<string, unknown>) {
  return {
    name: body.name !== undefined ? requiredName(body.name) : undefined,
    industry: body.industry !== undefined ? (String(body.industry ?? "").trim() || null) : undefined,
    employeeCount: parseEmployeeCount(body.employeeCount),
    website: normalizeWebsite(body.website),
    tags: normalizeTags(body.tags),
    notes: normalizeNotes(body.notes),
    ownerId: parseOptionalUuid(body.ownerId, "ownerId"),
  };
}

function companyWhere(actor: Actor, query: Record<string, unknown>): Prisma.CompanyWhereInput {
  const search = String(query.search ?? "").trim();
  const industry = String(query.industry ?? "").trim();
  const tag = String(query.tag ?? "").trim().toLowerCase();
  const ownerId = parseOptionalUuid(query.owner ?? query.ownerId, "owner");
  const createdFrom = parseDateBound(query.createdFrom, "createdFrom");
  const createdTo = parseDateBound(query.createdTo, "createdTo");

  return {
    organizationId: actor.organizationId,
    ...ownerScope(actor.role, actor.userId),
    ...(industry ? { industry: { equals: industry, mode: "insensitive" } } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(createdFrom || createdTo
      ? {
          createdAt: {
            ...(createdFrom ? { gte: createdFrom } : {}),
            ...(createdTo ? { lte: createdTo } : {}),
          },
        }
      : {}),
    ...(search
      ? {
          OR: [
            { name: contains(search) },
            { website: contains(search) },
            { industry: contains(search) },
          ],
        }
      : {}),
  };
}

export async function listCompanies(actor: Actor, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const sortBy = whitelistSort(query.sortBy ?? query.sort, COMPANY_SORT, "updatedAt");
  const sortOrder = parseSortOrder(query.sortOrder ?? query.order);
  const where = companyWhere(actor, query);

  const [total, items] = await prisma.$transaction([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: items.map(mapCompany),
    pagination: paginationMeta(page, limit, total),
  };
}

export async function suggestCompanyDuplicates(actor: Actor, name: string) {
  const normalized = requiredName(name);
  const token = normalized.split(" ")[0] ?? normalized;
  return prisma.company.findMany({
    where: {
      organizationId: actor.organizationId,
      ...ownerScope(actor.role, actor.userId),
      name: contains(token),
    },
    select: { id: true, name: true, industry: true, website: true },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getCompany(actor: Actor, id: string) {
  const company = await prisma.company.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
    include: {
      owner: { select: { id: true, fullName: true, email: true } },
    },
  });
  if (!company) throw fail(404, "COMPANY_NOT_FOUND", "Company not found");
  assertVisibleOwned(actor.role, actor.userId, company.ownerId);

  const visibility = ownerScope(actor.role, actor.userId);
  const [contacts, deals, activities, tasks, pipeline] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId: actor.organizationId, companyId: company.id, ...visibility },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        jobTitle: true,
        ownerId: true,
      },
      orderBy: { lastName: "asc" },
      take: 100,
    }),
    prisma.deal.findMany({
      where: { organizationId: actor.organizationId, companyId: company.id, ...visibility },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        stage: { select: { name: true, isWon: true, isLost: true } },
        ownerId: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.activity.findMany({
      where: { organizationId: actor.organizationId, companyId: company.id, ...activityScope(actor.role, actor.userId) },
      select: {
        id: true,
        type: true,
        content: true,
        occurredAt: true,
        createdAt: true,
        author: { select: { id: true, fullName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
    prisma.task.findMany({
      where: { organizationId: actor.organizationId, companyId: company.id, ...taskScope(actor.role, actor.userId) },
      select: {
        id: true,
        title: true,
        status: true,
        dueDate: true,
        assigneeId: true,
      },
      orderBy: { dueDate: "asc" },
      take: 20,
    }),
    prisma.deal.aggregate({
      where: {
        organizationId: actor.organizationId,
        companyId: company.id,
        ...visibility,
        stage: { isWon: false, isLost: false },
      },
      _sum: { amount: true },
    }),
  ]);

  return {
    ...mapCompany(company),
    contacts,
    deals,
    activities,
    tasks,
    openPipelineValue: pipeline._sum.amount ? Number(pipeline._sum.amount) : 0,
  };
}

export async function createCompany(actor: Actor, body: Record<string, unknown>) {
  const fields = companyWrite(body);
  const name = fields.name ?? requiredName(undefined);
  const ownerId = await resolveOwnerId({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    role: actor.role,
    requestedOwnerId: fields.ownerId,
  });

  const company = await prisma.company.create({
    data: {
      organizationId: actor.organizationId,
      name,
      industry: fields.industry ?? null,
      employeeCount: fields.employeeCount ?? null,
      website: fields.website ?? null,
      ownerId,
      tags: fields.tags ?? [],
      notes: fields.notes ?? null,
    },
    include: LIST_INCLUDE,
  });

  await writeAudit(prisma, {
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: "COMPANY_CREATED",
    entityType: "companies",
    entityId: company.id,
    metadata: { name: company.name },
  });

  return mapCompany(company);
}

export async function updateCompany(actor: Actor, id: string, body: Record<string, unknown>) {
  const existing = await prisma.company.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
  });
  if (!existing) throw fail(404, "COMPANY_NOT_FOUND", "Company not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  const fields = companyWrite(body);
  const nextOwnerId =
    fields.ownerId !== undefined
      ? await resolveOwnerId({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          role: actor.role,
          requestedOwnerId: fields.ownerId,
        })
      : existing.ownerId;

  if (fields.ownerId && nextOwnerId !== existing.ownerId && nextOwnerId !== actor.userId) {
    // MEMBER cannot reassign; resolveOwnerId already forces self for members.
  }

  const data: Prisma.CompanyUpdateInput = {
    ...(fields.name !== undefined ? { name: fields.name } : {}),
    ...(fields.industry !== undefined ? { industry: fields.industry } : {}),
    ...(fields.employeeCount !== undefined ? { employeeCount: fields.employeeCount } : {}),
    ...(fields.website !== undefined ? { website: fields.website } : {}),
    ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
    ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
    ...(fields.ownerId !== undefined ? { owner: { connect: { id: nextOwnerId! } } } : {}),
  };

  const updated = await prisma.company.update({
    where: { id: existing.id },
    data,
    include: LIST_INCLUDE,
  });

  await writeAudit(prisma, {
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action: nextOwnerId !== existing.ownerId ? "COMPANY_OWNER_CHANGED" : "COMPANY_UPDATED",
    entityType: "companies",
    entityId: updated.id,
    metadata: {
      name: updated.name,
      ...(nextOwnerId !== existing.ownerId ? { fromOwnerId: existing.ownerId, toOwnerId: nextOwnerId } : {}),
    },
  });

  return mapCompany(updated);
}

export async function deleteCompany(actor: Actor, id: string) {
  const existing = await prisma.company.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
  });
  if (!existing) throw fail(404, "COMPANY_NOT_FOUND", "Company not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  const [contacts, deals, activities, tasks] = await Promise.all([
    prisma.contact.count({ where: { organizationId: actor.organizationId, companyId: existing.id } }),
    prisma.deal.count({ where: { organizationId: actor.organizationId, companyId: existing.id } }),
    prisma.activity.count({ where: { organizationId: actor.organizationId, companyId: existing.id } }),
    prisma.task.count({ where: { organizationId: actor.organizationId, companyId: existing.id } }),
  ]);

  if (contacts + deals + activities + tasks > 0) {
    throw fail(409, "COMPANY_HAS_DEPENDENCIES", "Reassign or remove related records before deleting this company.", {
      contacts,
      deals,
      activities,
      tasks,
    });
  }

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "COMPANY_DELETED",
      entityType: "companies",
      entityId: existing.id,
      metadata: { name: existing.name },
    });
    await tx.company.delete({ where: { id: existing.id } });
  });

  return { id: existing.id };
}

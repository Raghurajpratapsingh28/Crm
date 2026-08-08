import type { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  contains,
  isUniqueConstraint,
  normalizeEmail,
  normalizeNotes,
  normalizePhone,
  normalizeTags,
  paginationMeta,
  parseContactSource,
  parseDateBound,
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
import { conflict, fail } from "../../utils/errors.js";

const CONTACT_SORT: Record<string, "firstName" | "lastName" | "email" | "createdAt" | "updatedAt"> = {
  firstName: "firstName",
  first_name: "firstName",
  lastName: "lastName",
  last_name: "lastName",
  email: "email",
  createdAt: "createdAt",
  created_at: "createdAt",
  updatedAt: "updatedAt",
  updated_at: "updatedAt",
};

const LIST_INCLUDE = {
  owner: { select: { id: true, fullName: true, email: true } },
  company: { select: { id: true, name: true, industry: true } },
} satisfies Prisma.ContactInclude;

type Actor = { organizationId: string; userId: string; role: Role };

function mapContact(contact: Prisma.ContactGetPayload<{ include: typeof LIST_INCLUDE }>) {
  return {
    id: contact.id,
    organizationId: contact.organizationId,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    jobTitle: contact.jobTitle,
    companyId: contact.companyId,
    industry: contact.industry,
    source: contact.source,
    ownerId: contact.ownerId,
    tags: contact.tags,
    notes: contact.notes,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    owner: contact.owner,
    company: contact.company,
  };
}

function contactWrite(body: Record<string, unknown>) {
  return {
    firstName: body.firstName !== undefined ? requiredName(body.firstName, "firstName") : undefined,
    lastName: body.lastName !== undefined ? requiredName(body.lastName, "lastName") : undefined,
    email: normalizeEmail(body.email),
    phone: normalizePhone(body.phone),
    jobTitle: body.jobTitle !== undefined ? (String(body.jobTitle ?? "").trim() || null) : undefined,
    companyId: parseOptionalUuid(body.companyId, "companyId"),
    industry: body.industry !== undefined ? (String(body.industry ?? "").trim() || null) : undefined,
    source: parseContactSource(body.source),
    tags: normalizeTags(body.tags),
    notes: normalizeNotes(body.notes),
    ownerId: parseOptionalUuid(body.ownerId, "ownerId"),
  };
}

async function assertCompanyInTenant(organizationId: string, companyId: string | null | undefined) {
  if (!companyId) return null;
  const company = await prisma.company.findFirst({
    where: scopedWhere(organizationId, { id: companyId }),
    select: { id: true },
  });
  if (!company) {
    throw fail(400, "INVALID_COMPANY_ASSOCIATION", "company must belong to this organization");
  }
  return company;
}

async function findDuplicate(organizationId: string, email: string, excludeId?: string) {
  return prisma.contact.findFirst({
    where: {
      organizationId,
      email,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    include: LIST_INCLUDE,
  });
}

function duplicateError(existing: Prisma.ContactGetPayload<{ include: typeof LIST_INCLUDE }>) {
  return conflict("CONTACT_DUPLICATE", "A contact with this email already exists.", {
    existingContactId: existing.id,
    existingContact: {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      company: existing.company,
    },
  });
}

function contactWhere(actor: Actor, query: Record<string, unknown>): Prisma.ContactWhereInput {
  const search = String(query.search ?? "").trim();
  const industry = String(query.industry ?? "").trim();
  const tag = String(query.tag ?? "").trim().toLowerCase();
  const ownerId = parseOptionalUuid(query.owner ?? query.ownerId, "owner");
  const companyId = parseOptionalUuid(query.company ?? query.companyId, "company");
  const source = parseContactSource(query.source);
  const createdFrom = parseDateBound(query.createdFrom, "createdFrom");
  const createdTo = parseDateBound(query.createdTo, "createdTo");

  return {
    organizationId: actor.organizationId,
    ...ownerScope(actor.role, actor.userId),
    ...(industry ? { industry: { equals: industry, mode: "insensitive" } } : {}),
    ...(ownerId ? { ownerId } : {}),
    ...(companyId ? { companyId } : {}),
    ...(source ? { source } : {}),
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
            { firstName: contains(search) },
            { lastName: contains(search) },
            { email: contains(search) },
            { phone: contains(search) },
            { jobTitle: contains(search) },
            { company: { name: contains(search) } },
          ],
        }
      : {}),
  };
}

export async function listContacts(actor: Actor, query: Record<string, unknown>) {
  const { page, limit, skip } = parsePagination(query);
  const sortBy = whitelistSort(query.sortBy ?? query.sort, CONTACT_SORT, "updatedAt");
  const sortOrder = parseSortOrder(query.sortOrder ?? query.order);
  const where = contactWhere(actor, query);

  const [total, items] = await prisma.$transaction([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: LIST_INCLUDE,
      orderBy: { [sortBy]: sortOrder },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: items.map(mapContact),
    pagination: paginationMeta(page, limit, total),
  };
}

export async function findContactDuplicate(actor: Actor, emailValue: unknown) {
  const email = normalizeEmail(emailValue);
  if (!email) return null;
  const existing = await findDuplicate(actor.organizationId, email);
  if (!existing) return null;
  return {
    existingContactId: existing.id,
    existingContact: {
      id: existing.id,
      firstName: existing.firstName,
      lastName: existing.lastName,
      email: existing.email,
      company: existing.company,
    },
  };
}

export async function getContact(actor: Actor, id: string) {
  const contact = await prisma.contact.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
    include: LIST_INCLUDE,
  });
  if (!contact) throw fail(404, "CONTACT_NOT_FOUND", "Contact not found");
  assertVisibleOwned(actor.role, actor.userId, contact.ownerId);

  const [deals, activities, tasks] = await Promise.all([
    prisma.deal.findMany({
      where: {
        organizationId: actor.organizationId,
        primaryContactId: contact.id,
        ...ownerScope(actor.role, actor.userId),
      },
      select: {
        id: true,
        name: true,
        amount: true,
        currency: true,
        stage: { select: { name: true, isWon: true, isLost: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.activity.findMany({
      where: {
        organizationId: actor.organizationId,
        contactId: contact.id,
        ...activityScope(actor.role, actor.userId),
      },
      select: {
        id: true,
        type: true,
        content: true,
        occurredAt: true,
        author: { select: { id: true, fullName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
    prisma.task.findMany({
      where: {
        organizationId: actor.organizationId,
        contactId: contact.id,
        ...taskScope(actor.role, actor.userId),
      },
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
  ]);

  return { ...mapContact(contact), deals, activities, tasks };
}

export async function createContact(actor: Actor, body: Record<string, unknown>) {
  const fields = contactWrite(body);
  const firstName = fields.firstName ?? requiredName(undefined, "firstName");
  const lastName = fields.lastName ?? requiredName(undefined, "lastName");
  await assertCompanyInTenant(actor.organizationId, fields.companyId ?? null);
  const ownerId = await resolveOwnerId({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    role: actor.role,
    requestedOwnerId: fields.ownerId,
  });

  if (fields.email) {
    const existing = await findDuplicate(actor.organizationId, fields.email);
    if (existing) throw duplicateError(existing);
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        organizationId: actor.organizationId,
        firstName,
        lastName,
        email: fields.email ?? null,
        phone: fields.phone ?? null,
        jobTitle: fields.jobTitle ?? null,
        companyId: fields.companyId ?? null,
        industry: fields.industry ?? null,
        source: fields.source ?? null,
        ownerId,
        tags: fields.tags ?? [],
        notes: fields.notes ?? null,
      },
      include: LIST_INCLUDE,
    });

    await writeAudit(prisma, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "CONTACT_CREATED",
      entityType: "contacts",
      entityId: contact.id,
      metadata: { name: `${contact.firstName} ${contact.lastName}` },
    });

    return mapContact(contact);
  } catch (error) {
    if (isUniqueConstraint(error) && fields.email) {
      const existing = await findDuplicate(actor.organizationId, fields.email);
      if (existing) throw duplicateError(existing);
    }
    throw error;
  }
}

export async function updateContact(actor: Actor, id: string, body: Record<string, unknown>) {
  const existing = await prisma.contact.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
    include: LIST_INCLUDE,
  });
  if (!existing) throw fail(404, "CONTACT_NOT_FOUND", "Contact not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  const fields = contactWrite(body);
  if (fields.companyId !== undefined) {
    await assertCompanyInTenant(actor.organizationId, fields.companyId);
  }

  const nextOwnerId =
    fields.ownerId !== undefined
      ? await resolveOwnerId({
          organizationId: actor.organizationId,
          actorId: actor.userId,
          role: actor.role,
          requestedOwnerId: fields.ownerId,
        })
      : existing.ownerId;

  const nextEmail = fields.email !== undefined ? fields.email : existing.email;
  if (nextEmail && nextEmail !== existing.email) {
    const duplicate = await findDuplicate(actor.organizationId, nextEmail, existing.id);
    if (duplicate) throw duplicateError(duplicate);
  }

  try {
    const updated = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        ...(fields.firstName !== undefined ? { firstName: fields.firstName } : {}),
        ...(fields.lastName !== undefined ? { lastName: fields.lastName } : {}),
        ...(fields.email !== undefined ? { email: fields.email } : {}),
        ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
        ...(fields.jobTitle !== undefined ? { jobTitle: fields.jobTitle } : {}),
        ...(fields.companyId !== undefined ? { companyId: fields.companyId } : {}),
        ...(fields.industry !== undefined ? { industry: fields.industry } : {}),
        ...(fields.source !== undefined ? { source: fields.source } : {}),
        ...(fields.tags !== undefined ? { tags: fields.tags } : {}),
        ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
        ...(fields.ownerId !== undefined ? { ownerId: nextOwnerId } : {}),
      },
      include: LIST_INCLUDE,
    });

    await writeAudit(prisma, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: nextOwnerId !== existing.ownerId ? "CONTACT_OWNER_CHANGED" : "CONTACT_UPDATED",
      entityType: "contacts",
      entityId: updated.id,
      metadata: {
        name: `${updated.firstName} ${updated.lastName}`,
        ...(nextOwnerId !== existing.ownerId ? { fromOwnerId: existing.ownerId, toOwnerId: nextOwnerId } : {}),
      },
    });

    return mapContact(updated);
  } catch (error) {
    if (isUniqueConstraint(error) && nextEmail) {
      const duplicate = await findDuplicate(actor.organizationId, nextEmail, existing.id);
      if (duplicate) throw duplicateError(duplicate);
    }
    throw error;
  }
}

export async function deleteContact(actor: Actor, id: string) {
  const existing = await prisma.contact.findFirst({
    where: scopedWhere(actor.organizationId, { id }),
  });
  if (!existing) throw fail(404, "CONTACT_NOT_FOUND", "Contact not found");
  assertVisibleOwned(actor.role, actor.userId, existing.ownerId);

  const deals = await prisma.deal.count({
    where: { organizationId: actor.organizationId, primaryContactId: existing.id },
  });
  if (deals > 0) {
    throw fail(409, "CONTACT_HAS_DEPENDENCIES", "Reassign related deals before deleting this contact.", { deals });
  }

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "CONTACT_DELETED",
      entityType: "contacts",
      entityId: existing.id,
      metadata: { name: `${existing.firstName} ${existing.lastName}` },
    });
    await tx.contact.delete({ where: { id: existing.id } });
  });

  return { id: existing.id };
}

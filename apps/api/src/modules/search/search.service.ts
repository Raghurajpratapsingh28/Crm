import type { Prisma, Role } from "@prisma/client";
import {
  PERMISSIONS,
  type GlobalSearchResponse,
  type GlobalSearchResult,
  type Permission,
  type SearchQueryType,
} from "@crm/types";
import { activitySearchWhere } from "../../lib/activity-task.js";
import { contains } from "../../lib/crm.js";
import { dealSearchWhere } from "../../lib/deal.js";
import { prisma } from "../../lib/prisma.js";
import { activityScope, ownerScope } from "../../services/authorization.service.js";
import { hasPermission } from "../../services/permission.service.js";
import { forbidden } from "../../utils/errors.js";
import {
  bestRank,
  groupSearchResults,
  matchingActivityType,
  matchRank,
  perTypeTake,
  RANK_NONE,
  takeTopResults,
} from "./search.utils.js";

type Actor = { organizationId: string; userId: string; role: Role };

const TYPE_PERMISSION: Record<Exclude<SearchQueryType, "all">, Permission> = {
  contacts: PERMISSIONS.CONTACTS_READ,
  companies: PERMISSIONS.COMPANIES_READ,
  deals: PERMISSIONS.DEALS_READ,
  activities: PERMISSIONS.ACTIVITIES_READ,
};

export function allowedSearchTypes(role: Role, type: SearchQueryType): Array<Exclude<SearchQueryType, "all">> {
  const requested: Array<Exclude<SearchQueryType, "all">> =
    type === "all" ? ["contacts", "companies", "deals", "activities"] : [type];
  return requested.filter((item) => hasPermission(role, TYPE_PERMISSION[item]));
}

function assertTypeAllowed(role: Role, type: SearchQueryType) {
  if (type === "all") return;
  if (!hasPermission(role, TYPE_PERMISSION[type])) {
    throw forbidden("You do not have permission to perform this action");
  }
}

function contactWhere(actor: Actor, q: string): Prisma.ContactWhereInput {
  const tokens = q.split(" ").filter(Boolean);
  const or: Prisma.ContactWhereInput[] = [
    { firstName: contains(q) },
    { lastName: contains(q) },
    { email: contains(q) },
    { phone: contains(q) },
    { jobTitle: contains(q) },
  ];
  if (tokens.length >= 2) {
    or.push({
      AND: tokens.map((token) => ({
        OR: [{ firstName: contains(token) }, { lastName: contains(token) }],
      })),
    });
  }
  return {
    organizationId: actor.organizationId,
    ...ownerScope(actor.role, actor.userId),
    OR: or,
  };
}

function companyWhere(actor: Actor, q: string): Prisma.CompanyWhereInput {
  return {
    organizationId: actor.organizationId,
    ...ownerScope(actor.role, actor.userId),
    OR: [{ name: contains(q) }, { website: contains(q) }, { industry: contains(q) }],
  };
}

function dealWhere(actor: Actor, q: string): Prisma.DealWhereInput {
  return {
    organizationId: actor.organizationId,
    ...ownerScope(actor.role, actor.userId),
    OR: dealSearchWhere(q),
  };
}

function activityWhere(actor: Actor, q: string): Prisma.ActivityWhereInput {
  const type = matchingActivityType(q);
  const search = activitySearchWhere(q) ?? [];
  const match: Prisma.ActivityWhereInput = { OR: type ? [...search, { type }] : search };
  const visibility = activityScope(actor.role, actor.userId);
  return {
    organizationId: actor.organizationId,
    ...visibility,
    AND: [match],
  };
}

function mapContact(
  row: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    updatedAt: Date;
  },
  q: string,
): GlobalSearchResult | null {
  const fullName = `${row.firstName} ${row.lastName}`.trim();
  const relevance = bestRank([fullName, row.firstName, row.lastName, row.email, row.phone, row.jobTitle], q);
  if (relevance === RANK_NONE) return null;
  return {
    id: row.id,
    type: "contact",
    title: fullName,
    subtitle: row.email ?? row.jobTitle ?? row.phone ?? undefined,
    href: `/contacts/${row.id}`,
    relevance,
    timestamp: row.updatedAt.toISOString(),
  };
}

function mapCompany(
  row: { id: string; name: string; website: string | null; industry: string | null; updatedAt: Date },
  q: string,
): GlobalSearchResult | null {
  const relevance = bestRank([row.name, row.website, row.industry], q);
  if (relevance === RANK_NONE) return null;
  return {
    id: row.id,
    type: "company",
    title: row.name,
    subtitle: row.industry ?? row.website ?? undefined,
    href: `/companies/${row.id}`,
    relevance,
    timestamp: row.updatedAt.toISOString(),
  };
}

function mapDeal(
  row: {
    id: string;
    name: string;
    updatedAt: Date;
    company: { name: string } | null;
    primaryContact: { firstName: string; lastName: string; email: string | null } | null;
  },
  q: string,
): GlobalSearchResult | null {
  const contactName = row.primaryContact
    ? `${row.primaryContact.firstName} ${row.primaryContact.lastName}`.trim()
    : "";
  const relevance = bestRank(
    [row.name, row.company?.name, contactName, row.primaryContact?.firstName, row.primaryContact?.lastName, row.primaryContact?.email],
    q,
  );
  if (relevance === RANK_NONE) return null;
  return {
    id: row.id,
    type: "deal",
    title: row.name,
    subtitle: row.company?.name ?? contactName ?? undefined,
    href: `/deals/${row.id}`,
    relevance,
    timestamp: row.updatedAt.toISOString(),
  };
}

function mapActivity(
  row: {
    id: string;
    type: string;
    content: string | null;
    occurredAt: Date;
    updatedAt: Date;
    deal: { name: string } | null;
    company: { name: string } | null;
    contact: { firstName: string; lastName: string } | null;
  },
  q: string,
): GlobalSearchResult | null {
  const contactName = row.contact ? `${row.contact.firstName} ${row.contact.lastName}`.trim() : "";
  const typeLabel = row.type.replace(/_/g, " ");
  const typeRank = matchingActivityType(q) === row.type ? matchRank(row.type, matchingActivityType(q) ?? "") : RANK_NONE;
  const relevance = Math.min(
    bestRank([row.content, typeLabel, row.deal?.name, row.company?.name, contactName], q),
    typeRank === RANK_NONE ? RANK_NONE : 1,
  );
  if (relevance === RANK_NONE) return null;
  const title = row.content?.trim() || typeLabel;
  return {
    id: row.id,
    type: "activity",
    title,
    subtitle: contactName || row.company?.name || row.deal?.name || typeLabel,
    href: `/activities/${row.id}`,
    relevance,
    timestamp: row.occurredAt.toISOString(),
  };
}

export async function globalSearch(
  actor: Actor,
  input: { q: string; type: SearchQueryType; limit: number },
): Promise<GlobalSearchResponse> {
  assertTypeAllowed(actor.role, input.type);
  const types = allowedSearchTypes(actor.role, input.type);
  const take = perTypeTake(input.limit);
  const q = input.q;

  const hits: GlobalSearchResult[] = [];

  await Promise.all(
    types.map(async (type) => {
      if (type === "contacts") {
        const rows = await prisma.contact.findMany({
          where: contactWhere(actor, q),
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            jobTitle: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take,
        });
        for (const row of rows) {
          const mapped = mapContact(row, q);
          if (mapped) hits.push(mapped);
        }
        return;
      }
      if (type === "companies") {
        const rows = await prisma.company.findMany({
          where: companyWhere(actor, q),
          select: { id: true, name: true, website: true, industry: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
          take,
        });
        for (const row of rows) {
          const mapped = mapCompany(row, q);
          if (mapped) hits.push(mapped);
        }
        return;
      }
      if (type === "deals") {
        const rows = await prisma.deal.findMany({
          where: dealWhere(actor, q),
          select: {
            id: true,
            name: true,
            updatedAt: true,
            company: { select: { id: true, name: true } },
            primaryContact: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
          orderBy: { updatedAt: "desc" },
          take,
        });
        for (const row of rows) {
          const mapped = mapDeal(row, q);
          if (mapped) hits.push(mapped);
        }
        return;
      }
      const rows = await prisma.activity.findMany({
        where: activityWhere(actor, q),
        select: {
          id: true,
          type: true,
          content: true,
          occurredAt: true,
          updatedAt: true,
          deal: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { occurredAt: "desc" },
        take,
      });
      for (const row of rows) {
        const mapped = mapActivity(row, q);
        if (mapped) hits.push(mapped);
      }
    }),
  );

  const selected = takeTopResults(hits, input.limit, input.type);
  return {
    query: q,
    results: groupSearchResults(selected),
    total: selected.length,
  };
}

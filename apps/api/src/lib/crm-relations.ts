import type { Prisma, Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { scopedWhere } from "./tenant-scope.js";
import { assertVisibleOwned } from "../services/authorization.service.js";
import { fail } from "../utils/errors.js";

export type CrmRelationIds = {
  dealId?: string | null;
  contactId?: string | null;
  companyId?: string | null;
};

export type LoadedCrmRelations = {
  deal: { id: string; companyId: string; primaryContactId: string; ownerId: string } | null;
  contact: { id: string; companyId: string | null; ownerId: string } | null;
  company: { id: string; ownerId: string | null } | null;
};

export async function loadCrmRelations(
  organizationId: string,
  ids: CrmRelationIds,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<LoadedCrmRelations> {
  const [deal, contact, company] = await Promise.all([
    ids.dealId
      ? client.deal.findFirst({
          where: scopedWhere(organizationId, { id: ids.dealId }),
          select: { id: true, companyId: true, primaryContactId: true, ownerId: true },
        })
      : Promise.resolve(null),
    ids.contactId
      ? client.contact.findFirst({
          where: scopedWhere(organizationId, { id: ids.contactId }),
          select: { id: true, companyId: true, ownerId: true },
        })
      : Promise.resolve(null),
    ids.companyId
      ? client.company.findFirst({
          where: scopedWhere(organizationId, { id: ids.companyId }),
          select: { id: true, ownerId: true },
        })
      : Promise.resolve(null),
  ]);

  if (ids.dealId && !deal) throw fail(400, "CROSS_TENANT_RELATION", "deal must belong to this organization");
  if (ids.contactId && !contact) throw fail(400, "CROSS_TENANT_RELATION", "contact must belong to this organization");
  if (ids.companyId && !company) throw fail(400, "CROSS_TENANT_RELATION", "company must belong to this organization");

  return { deal, contact, company };
}

export function assertActorCanLinkRelations(
  actor: { role: Role; userId: string },
  relations: LoadedCrmRelations,
) {
  if (relations.deal) assertVisibleOwned(actor.role, actor.userId, relations.deal.ownerId);
  if (relations.contact) assertVisibleOwned(actor.role, actor.userId, relations.contact.ownerId);
  if (relations.company) assertVisibleOwned(actor.role, actor.userId, relations.company.ownerId);
}

export function assertCompatibleRelations(
  relations: LoadedCrmRelations,
  code: "INVALID_ACTIVITY_RELATION" | "INVALID_TASK_RELATION",
) {
  const { deal, contact, company } = relations;
  if (deal && company && deal.companyId !== company.id) {
    throw fail(400, code, "company does not match the selected deal");
  }
  if (contact && company && contact.companyId && contact.companyId !== company.id) {
    throw fail(400, code, "contact does not belong to the selected company");
  }
  if (deal && contact && contact.companyId && contact.companyId !== deal.companyId) {
    throw fail(400, code, "contact does not belong to the deal company");
  }
}

import type { Role } from "@crm/types";
import { notFound } from "../utils/errors.js";

export type OwnedRecord = {
  organizationId: string;
  ownerId?: string | null;
};

export type AssignedRecord = {
  organizationId: string;
  assigneeId?: string | null;
};

export type AuthoredRecord = {
  organizationId: string;
  authorId?: string | null;
};

export function hasTeamVisibility(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function ownerScope(role: Role, userId: string) {
  return hasTeamVisibility(role) ? {} : { ownerId: userId };
}

export function assigneeScope(role: Role, userId: string) {
  return hasTeamVisibility(role) ? {} : { assigneeId: userId };
}

export function authorScope(role: Role, userId: string) {
  return hasTeamVisibility(role) ? {} : { authorId: userId };
}

export function activityScope(role: Role, userId: string) {
  if (hasTeamVisibility(role)) return {};
  return {
    OR: [
      { authorId: userId },
      { deal: { ownerId: userId } },
      { company: { ownerId: userId } },
      { contact: { ownerId: userId } },
    ],
  };
}

export function taskScope(role: Role, userId: string) {
  if (hasTeamVisibility(role)) return {};
  return {
    OR: [
      { assigneeId: userId },
      { createdById: userId },
      { deal: { ownerId: userId } },
      { company: { ownerId: userId } },
      { contact: { ownerId: userId } },
    ],
  };
}

export function canAccessOwned(role: Role, userId: string, ownerId?: string | null) {
  if (hasTeamVisibility(role)) return true;
  return ownerId === userId;
}

export function canAccessAssigned(role: Role, userId: string, assigneeId?: string | null) {
  if (hasTeamVisibility(role)) return true;
  return assigneeId === userId;
}

export function canAccessAuthored(role: Role, userId: string, authorId?: string | null) {
  if (hasTeamVisibility(role)) return true;
  return authorId === userId;
}

export function canModifyOwned(role: Role, userId: string, ownerId?: string | null) {
  return canAccessOwned(role, userId, ownerId);
}

export function canDeleteOwned(role: Role, userId: string, ownerId?: string | null) {
  return canAccessOwned(role, userId, ownerId);
}

export function canAssignResource(role: Role) {
  return role === "ADMIN" || role === "MANAGER";
}

export function assertVisibleOwned(role: Role, userId: string, ownerId?: string | null) {
  if (!canAccessOwned(role, userId, ownerId)) {
    throw notFound();
  }
}

export function assertVisibleAssigned(role: Role, userId: string, assigneeId?: string | null) {
  if (!canAccessAssigned(role, userId, assigneeId)) {
    throw notFound();
  }
}

export function assertVisibleAuthored(role: Role, userId: string, authorId?: string | null) {
  if (!canAccessAuthored(role, userId, authorId)) {
    throw notFound();
  }
}

import type { Permission, Role } from "@crm/types";
import { roleHasPermission } from "@crm/types";

export function hasPermission(role: Role | undefined, permission: Permission) {
  if (!role) return false;
  return roleHasPermission(role, permission);
}

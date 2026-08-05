import { PERMISSIONS, type Permission } from "@crm/types";

export { PERMISSIONS, type Permission };

export function can(permissions: readonly Permission[] | undefined, permission: Permission) {
  return Boolean(permissions?.includes(permission));
}

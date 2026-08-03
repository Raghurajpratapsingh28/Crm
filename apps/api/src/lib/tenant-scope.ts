export function scopedWhere<T extends Record<string, unknown>>(
  organizationId: string,
  where: T,
): T & { organizationId: string } {
  return { ...where, organizationId };
}

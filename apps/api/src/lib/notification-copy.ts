export type NotificationEntityType = "TASK" | "DEAL" | "CONTACT" | "COMPANY" | "INVITATION";

export function notificationContent(
  type: string,
  payload: Record<string, unknown> | null | undefined,
): { title: string; message: string; entityType: NotificationEntityType | null; entityId: string | null } {
  const name = String(payload?.title ?? payload?.name ?? payload?.dealName ?? "a record");
  const fromStage = payload?.fromStage ? String(payload.fromStage) : "";
  const toStage = payload?.toStage ? String(payload.toStage) : "";
  const taskId = payload?.taskId ? String(payload.taskId) : null;
  const dealId = payload?.dealId ? String(payload.dealId) : null;
  const contactId = payload?.contactId ? String(payload.contactId) : null;
  const companyId = payload?.companyId ? String(payload.companyId) : null;

  switch (type) {
    case "TASK_ASSIGNED":
      return { title: "New task assigned", message: `"${name}" was assigned to you.`, entityType: "TASK", entityId: taskId };
    case "TASK_REMINDER":
      return { title: "Upcoming task", message: `"${name}" is due soon.`, entityType: "TASK", entityId: taskId };
    case "FOLLOW_UP_OVERDUE":
      return { title: "Task overdue", message: `"${name}" is overdue.`, entityType: "TASK", entityId: taskId };
    case "DEAL_ASSIGNED":
    case "LEAD_ASSIGNED": {
      const company = payload?.companyName ? ` (${String(payload.companyName)})` : "";
      return { title: "Deal assigned", message: `"${name}"${company} was assigned to you.`, entityType: "DEAL", entityId: dealId };
    }
    case "DEAL_WON":
      return { title: "Deal won", message: `"${name}" was marked as won.`, entityType: "DEAL", entityId: dealId };
    case "DEAL_LOST":
      return { title: "Deal lost", message: `"${name}" was marked as lost.`, entityType: "DEAL", entityId: dealId };
    case "DEAL_STAGE_CHANGED":
      return {
        title: toStage === "Negotiation" ? "Deal moved to Negotiation" : "Deal stage changed",
        message: fromStage && toStage ? `"${name}" moved from ${fromStage} to ${toStage}.` : `"${name}" changed stage.`,
        entityType: "DEAL",
        entityId: dealId,
      };
    case "TEAM_MEMBER_JOINED":
      return { title: "Team member joined", message: `${payload?.email ?? "A teammate"} accepted their invitation.`, entityType: null, entityId: null };
    case "MEMBER_ROLE_CHANGED":
      return { title: "Role updated", message: "Your organization role was changed.", entityType: null, entityId: null };
    case "MEMBER_STATUS_CHANGED":
      return {
        title: "Membership updated",
        message: `Your membership is now ${String(payload?.status ?? "updated")}.`,
        entityType: null,
        entityId: null,
      };
    default:
      return { title: "Notification", message: name, entityType: dealId ? "DEAL" : taskId ? "TASK" : contactId ? "CONTACT" : companyId ? "COMPANY" : null, entityId: dealId ?? taskId ?? contactId ?? companyId };
  }
}

export function notificationHref(input: {
  entityType?: string | null;
  entityId?: string | null;
  payload?: { taskId?: string; dealId?: string; companyId?: string; contactId?: string } | null;
}) {
  const type = input.entityType;
  const id = input.entityId;
  if (type === "TASK" && id) return `/tasks/${id}`;
  if (type === "DEAL" && id) return `/deals/${id}`;
  if (type === "CONTACT" && id) return `/contacts/${id}`;
  if (type === "COMPANY" && id) return `/companies/${id}`;
  const payload = input.payload;
  if (payload?.taskId) return `/tasks/${payload.taskId}`;
  if (payload?.dealId) return `/deals/${payload.dealId}`;
  if (payload?.contactId) return `/contacts/${payload.contactId}`;
  if (payload?.companyId) return `/companies/${payload.companyId}`;
  return "/notifications";
}

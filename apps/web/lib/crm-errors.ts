const MESSAGES: Record<string, string> = {
  COMPANY_NOT_FOUND: "That company was not found.",
  CONTACT_NOT_FOUND: "That contact was not found.",
  COMPANY_HAS_DEPENDENCIES: "Reassign related contacts, deals, activities, or tasks before deleting this company.",
  CONTACT_HAS_DEPENDENCIES: "Reassign related deals before deleting this contact.",
  CONTACT_DUPLICATE: "A contact with this email already exists.",
  INVALID_COMPANY: "Check the company details and try again.",
  INVALID_CONTACT: "Check the contact details and try again.",
  INVALID_OWNER: "Owner must be an active member of this organization.",
  INVALID_COMPANY_ASSOCIATION: "That company does not belong to this organization.",
  INSUFFICIENT_PERMISSION: "You do not have permission to perform this action.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "Not found.",
  ACTIVITY_NOT_FOUND: "That activity was not found.",
  ACTIVITY_FORBIDDEN: "You cannot change this activity.",
  INVALID_ACTIVITY_TYPE: "Choose a valid activity type.",
  INVALID_ACTIVITY_RELATION: "The related company, contact, and deal do not match.",
  TASK_NOT_FOUND: "That task was not found.",
  TASK_FORBIDDEN: "You cannot change this task.",
  INVALID_TASK_ASSIGNEE: "Assignee must be an active member of this organization.",
  TASK_ALREADY_COMPLETED: "This task is already complete.",
  TASK_ALREADY_OPEN: "This task is already open.",
  INVALID_TASK_RELATION: "The related company, contact, and deal do not match.",
  INVALID_DUE_DATE: "Enter a valid due date.",
  CROSS_TENANT_RELATION: "Related records must belong to this organization.",
};

export function crmErrorMessage(code?: string, fallback?: string) {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback ?? "Something went wrong. Please try again.";
}

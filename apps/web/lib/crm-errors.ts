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
};

export function crmErrorMessage(code?: string, fallback?: string) {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback ?? "Something went wrong. Please try again.";
}

const MESSAGES: Record<string, string> = {
  MEMBER_ALREADY_EXISTS: "This user is already a member of the organization.",
  INVITATION_ALREADY_EXISTS: "A pending invitation already exists for this email.",
  INVITATION_EXPIRED: "This invitation has expired.",
  INVITATION_CANCELLED: "This invitation was cancelled.",
  INVITATION_ALREADY_ACCEPTED: "This invitation has already been accepted.",
  INVALID_INVITATION: "This invitation is invalid.",
  EMAIL_MISMATCH: "Sign in with the email address this invitation was sent to.",
  MEMBERSHIP_ALREADY_EXISTS: "You are already a member of this organization.",
  MEMBER_NOT_FOUND: "That team member was not found.",
  LAST_ADMIN_REQUIRED: "The organization must keep at least one active admin.",
  INSUFFICIENT_PERMISSION: "You do not have permission to perform this action.",
  FORBIDDEN: "You do not have permission to perform this action.",
  MEMBER_DEACTIVATED: "This member is deactivated.",
  RATE_LIMITED: "Too many requests. Try again shortly.",
  NOT_FOUND: "Not found.",
};

export function teamErrorMessage(code?: string, fallback?: string) {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback ?? "Something went wrong. Please try again.";
}

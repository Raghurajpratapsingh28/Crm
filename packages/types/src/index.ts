export type Role = "ADMIN" | "MANAGER" | "MEMBER";

export type MemberStatus = "INVITED" | "ACTIVE" | "DEACTIVATED";

export type DealStageName =
  | "Lead"
  | "Contacted"
  | "Qualified"
  | "Meeting"
  | "Proposal"
  | "Negotiation"
  | "Won"
  | "Lost";

export type ActivityType = "CALL" | "EMAIL" | "MEETING" | "NOTE" | "STATUS_CHANGE";

export type TaskStatus = "OPEN" | "DONE";

export type PaymentProvider = "STRIPE" | "RAZORPAY";

export type SubscriptionStatus = "INCOMPLETE" | "ACTIVE" | "PAST_DUE" | "CANCELED";

/** Job types the Express API enqueues and the Go worker consumes. */
export type JobType =
  | "email.invite"
  | "email.receipt"
  | "email.follow_up"
  | "notification.fanout"
  | "payments.reconcile"
  | "payments.dunning"
  | "analytics.rollup"
  | "deals.flag_stale"
  | "tasks.remind";

export type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type NotificationType =
  | "LEAD_ASSIGNED"
  | "DEAL_STAGE_CHANGED"
  | "DEAL_ASSIGNED"
  | "DEAL_WON"
  | "DEAL_LOST"
  | "FOLLOW_UP_OVERDUE"
  | "TASK_ASSIGNED"
  | "TASK_REMINDER"
  | "PROPOSAL_ACCEPTED"
  | "PAYMENT_RECEIVED"
  | "TEAM_MEMBER_JOINED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_STATUS_CHANGED";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID"
  | "NOT_FOUND"
  | "INTERNAL"
  | "MEMBER_ALREADY_EXISTS"
  | "INVITATION_ALREADY_EXISTS"
  | "INVITATION_EXPIRED"
  | "INVITATION_CANCELLED"
  | "INVITATION_ALREADY_ACCEPTED"
  | "INVALID_INVITATION"
  | "EMAIL_MISMATCH"
  | "MEMBERSHIP_ALREADY_EXISTS"
  | "LAST_ADMIN_REQUIRED"
  | "RATE_LIMITED"
  | "COMPANY_NOT_FOUND"
  | "CONTACT_NOT_FOUND"
  | "COMPANY_HAS_DEPENDENCIES"
  | "CONTACT_HAS_DEPENDENCIES"
  | "CONTACT_DUPLICATE"
  | "COMPANY_DUPLICATE_WARNING"
  | "INVALID_COMPANY"
  | "INVALID_CONTACT"
  | "INVALID_OWNER"
  | "INVALID_COMPANY_ASSOCIATION"
  | "INSUFFICIENT_PERMISSION"
  | "DEAL_NOT_FOUND"
  | "DEAL_FORBIDDEN"
  | "PIPELINE_NOT_FOUND"
  | "STAGE_NOT_FOUND"
  | "INVALID_STAGE"
  | "INVALID_STAGE_PIPELINE"
  | "LOST_REASON_REQUIRED"
  | "INVALID_PROBABILITY"
  | "DEAL_CONFLICT"
  | "ACTIVITY_NOT_FOUND"
  | "ACTIVITY_FORBIDDEN"
  | "INVALID_ACTIVITY_TYPE"
  | "INVALID_ACTIVITY_RELATION"
  | "TASK_NOT_FOUND"
  | "TASK_FORBIDDEN"
  | "INVALID_TASK_ASSIGNEE"
  | "TASK_ALREADY_COMPLETED"
  | "TASK_ALREADY_OPEN"
  | "INVALID_TASK_RELATION"
  | "INVALID_DUE_DATE"
  | "CROSS_TENANT_RELATION";

/** `id` is the Supabase `auth.users.id`. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  organizationId: string;
}

export type ContactSource =
  | "REFERRAL"
  | "WEBSITE"
  | "COLD_OUTREACH"
  | "EVENT"
  | "SOCIAL"
  | "PARTNER"
  | "OTHER";

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode | string;
    message: string;
  };
  requestId: string;
  data?: unknown;
}

export interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

export const PERMISSIONS = {
  ORGANIZATION_READ: "organization.read",
  ORGANIZATION_UPDATE: "organization.update",

  USERS_READ: "users.read",
  USERS_INVITE: "users.invite",
  USERS_UPDATE: "users.update",
  USERS_DEACTIVATE: "users.deactivate",

  CONTACTS_READ: "contacts.read",
  CONTACTS_CREATE: "contacts.create",
  CONTACTS_UPDATE: "contacts.update",
  CONTACTS_DELETE: "contacts.delete",

  COMPANIES_READ: "companies.read",
  COMPANIES_CREATE: "companies.create",
  COMPANIES_UPDATE: "companies.update",
  COMPANIES_DELETE: "companies.delete",

  DEALS_READ: "deals.read",
  DEALS_CREATE: "deals.create",
  DEALS_UPDATE: "deals.update",
  DEALS_DELETE: "deals.delete",
  DEALS_ASSIGN: "deals.assign",

  PIPELINE_READ: "pipeline.read",
  PIPELINE_MANAGE: "pipeline.manage",

  ACTIVITIES_READ: "activities.read",
  ACTIVITIES_CREATE: "activities.create",
  ACTIVITIES_UPDATE: "activities.update",
  ACTIVITIES_DELETE: "activities.delete",

  TASKS_READ: "tasks.read",
  TASKS_CREATE: "tasks.create",
  TASKS_UPDATE: "tasks.update",
  TASKS_DELETE: "tasks.delete",

  ANALYTICS_READ: "analytics.read",
  ANALYTICS_TEAM: "analytics.team",

  NOTIFICATIONS_READ: "notifications.read",

  BILLING_READ: "billing.read",
  BILLING_MANAGE: "billing.manage",

  AUDIT_READ: "audit.read",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.ORGANIZATION_UPDATE,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_INVITE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DEACTIVATE,
    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_UPDATE,
    PERMISSIONS.CONTACTS_DELETE,
    PERMISSIONS.COMPANIES_READ,
    PERMISSIONS.COMPANIES_CREATE,
    PERMISSIONS.COMPANIES_UPDATE,
    PERMISSIONS.COMPANIES_DELETE,
    PERMISSIONS.DEALS_READ,
    PERMISSIONS.DEALS_CREATE,
    PERMISSIONS.DEALS_UPDATE,
    PERMISSIONS.DEALS_DELETE,
    PERMISSIONS.DEALS_ASSIGN,
    PERMISSIONS.PIPELINE_READ,
    PERMISSIONS.PIPELINE_MANAGE,
    PERMISSIONS.ACTIVITIES_READ,
    PERMISSIONS.ACTIVITIES_CREATE,
    PERMISSIONS.ACTIVITIES_UPDATE,
    PERMISSIONS.ACTIVITIES_DELETE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.ANALYTICS_TEAM,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.BILLING_READ,
    PERMISSIONS.BILLING_MANAGE,
    PERMISSIONS.AUDIT_READ,
  ],
  MANAGER: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_UPDATE,
    PERMISSIONS.CONTACTS_DELETE,
    PERMISSIONS.COMPANIES_READ,
    PERMISSIONS.COMPANIES_CREATE,
    PERMISSIONS.COMPANIES_UPDATE,
    PERMISSIONS.COMPANIES_DELETE,
    PERMISSIONS.DEALS_READ,
    PERMISSIONS.DEALS_CREATE,
    PERMISSIONS.DEALS_UPDATE,
    PERMISSIONS.DEALS_DELETE,
    PERMISSIONS.DEALS_ASSIGN,
    PERMISSIONS.PIPELINE_READ,
    PERMISSIONS.ACTIVITIES_READ,
    PERMISSIONS.ACTIVITIES_CREATE,
    PERMISSIONS.ACTIVITIES_UPDATE,
    PERMISSIONS.ACTIVITIES_DELETE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.TASKS_DELETE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.ANALYTICS_TEAM,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.AUDIT_READ,
  ],
  MEMBER: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.CONTACTS_READ,
    PERMISSIONS.CONTACTS_CREATE,
    PERMISSIONS.CONTACTS_UPDATE,
    PERMISSIONS.COMPANIES_READ,
    PERMISSIONS.COMPANIES_CREATE,
    PERMISSIONS.COMPANIES_UPDATE,
    PERMISSIONS.DEALS_READ,
    PERMISSIONS.DEALS_CREATE,
    PERMISSIONS.DEALS_UPDATE,
    PERMISSIONS.PIPELINE_READ,
    PERMISSIONS.ACTIVITIES_READ,
    PERMISSIONS.ACTIVITIES_CREATE,
    PERMISSIONS.ACTIVITIES_UPDATE,
    PERMISSIONS.TASKS_READ,
    PERMISSIONS.TASKS_CREATE,
    PERMISSIONS.TASKS_UPDATE,
    PERMISSIONS.NOTIFICATIONS_READ,
  ],
};

export function permissionsForRole(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const DEFAULT_PIPELINE_NAME = "Default Sales Pipeline";

export const DEFAULT_PIPELINE_STAGES: ReadonlyArray<{
  name: DealStageName;
  key: string;
  order: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
}> = [
  { name: "Lead", key: "lead", order: 0, probability: 10, isWon: false, isLost: false },
  { name: "Contacted", key: "contacted", order: 1, probability: 20, isWon: false, isLost: false },
  { name: "Qualified", key: "qualified", order: 2, probability: 35, isWon: false, isLost: false },
  { name: "Meeting", key: "meeting", order: 3, probability: 50, isWon: false, isLost: false },
  { name: "Proposal", key: "proposal", order: 4, probability: 65, isWon: false, isLost: false },
  { name: "Negotiation", key: "negotiation", order: 5, probability: 80, isWon: false, isLost: false },
  { name: "Won", key: "won", order: 6, probability: 100, isWon: true, isLost: false },
  { name: "Lost", key: "lost", order: 7, probability: 0, isWon: false, isLost: true },
];

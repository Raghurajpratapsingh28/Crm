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

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INVALID"
  | "NOT_FOUND"
  | "INTERNAL";

/** `id` is the Supabase `auth.users.id`. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  organizationId: string;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode | string;
    message: string;
  };
  requestId: string;
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
  order: number;
  isWon: boolean;
  isLost: boolean;
}> = [
  { name: "Lead", order: 0, isWon: false, isLost: false },
  { name: "Contacted", order: 1, isWon: false, isLost: false },
  { name: "Qualified", order: 2, isWon: false, isLost: false },
  { name: "Meeting", order: 3, isWon: false, isLost: false },
  { name: "Proposal", order: 4, isWon: false, isLost: false },
  { name: "Negotiation", order: 5, isWon: false, isLost: false },
  { name: "Won", order: 6, isWon: true, isLost: false },
  { name: "Lost", order: 7, isWon: false, isLost: true },
];

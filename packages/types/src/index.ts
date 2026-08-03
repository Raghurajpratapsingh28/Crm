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

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

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "note"
  | "status_change";

export type RelatedType = "contact" | "company" | "deal";

export type PaymentProvider = "RAZORPAY" | "STRIPE";

export type SubscriptionStatus =
  | "INCOMPLETE"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED";

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

export interface AuthUser {
  id: string;
  supabaseUserId: string;
  email: string;
  fullName: string;
  role: Role;
  organizationId: string;
}

export interface ApiError {
  error: string;
  message: string;
}

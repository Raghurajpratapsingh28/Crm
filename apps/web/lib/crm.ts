export interface PersonSummary {
  id: string;
  fullName: string;
  email: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  industry: string | null;
}

export interface CompanyRecord {
  id: string;
  name: string;
  industry: string | null;
  employeeCount: number | null;
  website: string | null;
  ownerId: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  owner: PersonSummary | null;
  contacts?: ContactRecord[];
  deals?: DealSummary[];
  activities?: ActivitySummary[];
  tasks?: TaskSummary[];
  openPipelineValue?: number;
}

export interface ContactRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  companyId: string | null;
  industry: string | null;
  source: string | null;
  ownerId: string;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  owner?: PersonSummary;
  company?: CompanySummary | null;
  deals?: DealSummary[];
  activities?: ActivitySummary[];
  tasks?: TaskSummary[];
}

export interface DealSummary {
  id: string;
  name: string;
  amount: string | number | null;
  currency?: string;
  stage?: { name: string; isWon: boolean; isLost: boolean };
}

export interface ActivitySummary {
  id: string;
  type: string;
  content?: string | null;
  occurredAt?: string;
  createdAt?: string;
  author?: { id: string; fullName: string };
}

export interface TaskSummary {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  assigneeId?: string;
}

export interface Paginated<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const CONTACT_SOURCES = [
  "REFERRAL",
  "WEBSITE",
  "COLD_OUTREACH",
  "EVENT",
  "SOCIAL",
  "PARTNER",
  "OTHER",
] as const;

export function contactName(contact: Pick<ContactRecord, "firstName" | "lastName">) {
  return `${contact.firstName} ${contact.lastName}`.trim();
}

export function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  return date.toLocaleDateString();
}

export function formatEmployees(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return String(value);
}

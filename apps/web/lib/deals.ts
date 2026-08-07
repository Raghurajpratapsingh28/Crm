export interface DealCard {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  stageId: string;
  ownerId: string;
  company: { id: string; name: string };
  owner: { id: string; fullName: string };
}

export interface KanbanStage {
  id: string;
  name: string;
  position: number;
  probability: number;
  isWon: boolean;
  isLost: boolean;
  dealCount: number;
  totalAmount: number;
  weightedValue: number;
  hasMore?: boolean;
  deals: DealCard[];
}

export interface KanbanBoard {
  pipeline: { id: string; name: string };
  perStage?: number;
  stages: KanbanStage[];
}

export interface DealRecord extends DealCard {
  description?: string | null;
  companyId: string;
  primaryContactId: string;
  pipelineId: string;
  probabilitySource?: string | null;
  lostReason?: string | null;
  lostReasonNote?: string | null;
  wonAt?: string | null;
  lostAt?: string | null;
  primaryContact?: { id: string; firstName: string; lastName: string; email: string | null };
  stage?: { id: string; name: string; probability: number; isWon: boolean; isLost: boolean };
  pipeline?: { id: string; name: string };
  stageHistory?: Array<{
    id: string;
    changedAt: string;
    fromStage?: { name: string } | null;
    toStage: { name: string };
    changedBy: { fullName: string };
  }>;
  activities?: Array<{ id: string; type: string; content: string | null; occurredAt: string }>;
  tasks?: Array<{ id: string; title: string; status: string }>;
}

export const LOST_REASONS = ["PRICE", "TIMING", "COMPETITOR", "NO_BUDGET", "GHOSTED", "OTHER"] as const;

export function formatMoney(amount: number | null | undefined, currency = "USD") {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

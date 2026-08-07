import type { LostReason, Prisma, ProbabilitySource } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { fail, invalid } from "../utils/errors.js";
import { contains, parseOptionalUuid, requiredName } from "./crm.js";

const CURRENCY = /^[A-Z]{3}$/;
const LOST_REASONS: LostReason[] = ["PRICE", "TIMING", "COMPETITOR", "NO_BUDGET", "GHOSTED", "OTHER"];

export const DEAL_SORT: Record<string, keyof Prisma.DealOrderByWithRelationInput> = {
  name: "name",
  amount: "amount",
  expectedCloseDate: "expectedCloseDate",
  expected_close_date: "expectedCloseDate",
  createdAt: "createdAt",
  created_at: "createdAt",
  updatedAt: "updatedAt",
  updated_at: "updatedAt",
  probability: "probability",
};

export function parseCurrency(value: unknown, fallback = "USD") {
  if (value === undefined || value === null || value === "") return fallback.toUpperCase();
  const currency = String(value).trim().toUpperCase();
  if (!CURRENCY.test(currency)) throw fail(400, "INVALID", "currency must be a 3-letter ISO code");
  return currency;
}

export function parseAmount(value: unknown): Decimal | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  let raw: string;
  if (value instanceof Decimal) raw = value.toString();
  else if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) throw fail(400, "INVALID", "amount must be >= 0");
    raw = value.toFixed(2);
  } else {
    raw = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw fail(400, "INVALID", "amount must be a valid decimal");
    if (Number(raw) < 0) throw fail(400, "INVALID", "amount must be >= 0");
  }
  return new Decimal(raw);
}

export function decimalToNumber(value: Decimal | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value.toString());
}

export function parseProbability(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 100) {
    throw fail(400, "INVALID_PROBABILITY", "probability must be an integer between 0 and 100");
  }
  return n;
}

export function parseCloseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw invalid("expectedCloseDate must be a valid date");
  return date;
}

export function parseLostReasonInput(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) throw fail(400, "LOST_REASON_REQUIRED", "lost reason is required when marking a deal as lost");
  const normalized = raw.toUpperCase().replace(/[\s-]+/g, "_") as LostReason;
  if (LOST_REASONS.includes(normalized)) {
    return { lostReason: normalized, lostReasonNote: normalized === "OTHER" ? raw : null };
  }
  return { lostReason: "OTHER" as LostReason, lostReasonNote: raw };
}

export function dealSearchWhere(search: string): Prisma.DealWhereInput["OR"] {
  return [
    { name: contains(search) },
    { company: { name: contains(search) } },
    { primaryContact: { firstName: contains(search) } },
    { primaryContact: { lastName: contains(search) } },
    { primaryContact: { email: contains(search) } },
  ];
}

export function parseDealListFilters(query: Record<string, unknown>) {
  return {
    ownerId: parseOptionalUuid(query.ownerId ?? query.owner, "ownerId"),
    companyId: parseOptionalUuid(query.companyId ?? query.company, "companyId"),
    pipelineId: parseOptionalUuid(query.pipelineId ?? query.pipeline, "pipelineId"),
    stageId: parseOptionalUuid(query.stageId ?? query.stage, "stageId"),
    minAmount: query.minAmount !== undefined && query.minAmount !== "" ? parseAmount(query.minAmount) : undefined,
    maxAmount: query.maxAmount !== undefined && query.maxAmount !== "" ? parseAmount(query.maxAmount) : undefined,
    closeDateFrom: query.closeDateFrom ? new Date(String(query.closeDateFrom)) : undefined,
    closeDateTo: query.closeDateTo ? new Date(String(query.closeDateTo)) : undefined,
    search: String(query.search ?? "").trim(),
  };
}

export function parseDealName(value: unknown) {
  return requiredName(value, "name");
}

export function parsePerStage(query: Record<string, unknown>, fallback = 50) {
  const raw = Number(query.perStage);
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(100, Math.floor(raw));
}

export function probabilityForNewDeal(stageProbability: number, supplied?: number | null) {
  if (supplied !== undefined && supplied !== null) {
    return { probability: supplied, probabilitySource: "MANUAL" as ProbabilitySource };
  }
  return { probability: stageProbability, probabilitySource: "STAGE_DEFAULT" as ProbabilitySource };
}

export function probabilityAfterStageChange(input: {
  currentProbability: number | null;
  probabilitySource: ProbabilitySource | null;
  fromStage: { isWon: boolean; isLost: boolean };
  toStage: { probability: number; isWon: boolean; isLost: boolean };
  resetProbability?: boolean;
}) {
  if (input.toStage.isWon) return { probability: 100, probabilitySource: input.probabilitySource };
  if (input.resetProbability || input.probabilitySource === "STAGE_DEFAULT" || !input.probabilitySource) {
    return { probability: input.toStage.probability, probabilitySource: "STAGE_DEFAULT" as ProbabilitySource };
  }
  return {
    probability: input.currentProbability ?? input.toStage.probability,
    probabilitySource: "MANUAL" as ProbabilitySource,
  };
}

export function likePattern(search: string) {
  return `%${search.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

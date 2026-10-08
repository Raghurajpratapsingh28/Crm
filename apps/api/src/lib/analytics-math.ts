import { Decimal } from "@prisma/client/runtime/library";
import type { MoneyAmount, TrendMetric, WinRateMetric } from "@crm/types";

export function moneyString(value: unknown) {
  try {
    const decimal = new Decimal(value === null || value === undefined ? 0 : String(value));
    if (!decimal.isFinite()) return "0.00";
    return decimal.toFixed(2);
  } catch {
    return "0.00";
  }
}

export function countInt(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

export function winRate(won: number, lost: number): WinRateMetric {
  const closed = won + lost;
  if (closed === 0) return { value: 0, hasData: false, won, lost };
  const value = new Decimal(won).div(closed).mul(100).toDecimalPlaces(2).toNumber();
  return { value, hasData: true, won, lost };
}

export function trendPercent(current: string | number, previous: string | number): TrendMetric {
  try {
    const prev = new Decimal(previous);
    if (!prev.isFinite() || prev.isZero()) return { percent: null, hasComparison: false };
    const percent = new Decimal(current).minus(prev).div(prev).mul(100).toDecimalPlaces(2).toNumber();
    return { percent, hasComparison: true };
  } catch {
    return { percent: null, hasComparison: false };
  }
}

export function collapseCurrencies(
  rows: Array<{ currency: string; amount: unknown }>,
  orgCurrency: string,
): MoneyAmount {
  const byCurrency = rows.map((row) => ({
    currency: row.currency || orgCurrency,
    amount: moneyString(row.amount),
  }));
  const nonzero = byCurrency.filter((row) => row.amount !== "0.00");
  const visible = nonzero.length > 0 ? nonzero : [];
  if (visible.length === 0) {
    return { amount: "0.00", currency: orgCurrency, mixed: false, byCurrency: [] };
  }
  if (visible.length === 1) {
    return {
      amount: visible[0]!.amount,
      currency: visible[0]!.currency,
      mixed: false,
      byCurrency: visible,
    };
  }
  return { amount: null, currency: orgCurrency, mixed: true, byCurrency: visible };
}

export function orgCurrencyAmount(money: MoneyAmount, orgCurrency: string) {
  if (!money.mixed) return money.amount ?? "0.00";
  return money.byCurrency.find((row) => row.currency === orgCurrency)?.amount ?? "0.00";
}

/** Money is stored as decimal major units (INR 999.00). Providers receive integer minor units. */

const EXPONENTS: Record<string, number> = {
  INR: 2,
  USD: 2,
  EUR: 2,
  GBP: 2,
};

export function normalizeCurrency(value: unknown): string {
  const code = String(value ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error("currency must be an ISO 4217 code");
  }
  return code;
}

export function exponentFor(currency: string) {
  return EXPONENTS[normalizeCurrency(currency)] ?? 2;
}

export function toMinorUnits(major: string | number, currency: string): number {
  const exp = exponentFor(currency);
  const [whole = "0", frac = ""] = String(major).split(".");
  const fraction = (frac + "0".repeat(exp)).slice(0, exp);
  const sign = String(major).trim().startsWith("-") ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 10 ** exp + Number(fraction || "0"));
}

export function fromMinorUnits(minor: number, currency: string): string {
  const exp = exponentFor(currency);
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 10 ** exp);
  const frac = String(abs % 10 ** exp).padStart(exp, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export function decimalString(value: unknown): string {
  if (value == null) return "0.00";
  if (typeof value === "object" && value && "toString" in value) {
    return Number(value.toString()).toFixed(2);
  }
  return Number(value).toFixed(2);
}

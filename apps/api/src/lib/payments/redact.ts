const SENSITIVE = /card|cvc|cvv|pan|iban|secret|password|token|routing|account_number|fingerprint|payment_method_details/i;

export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactPayload(item, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE.test(key) ? "[redacted]" : redactPayload(nested, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 4000) return `${value.slice(0, 4000)}…`;
  return value;
}

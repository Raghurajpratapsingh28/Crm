export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7"
  | "last_30"
  | "this_month"
  | "last_month"
  | "this_quarter"
  | "this_year"
  | "custom";

export const DATE_PRESETS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "this_quarter", label: "This quarter" },
  { id: "this_year", label: "This year" },
  { id: "custom", label: "Custom" },
];

export function resolveTimeZone(timeZone?: string | null) {
  if (!timeZone) return "UTC";
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function todayYmd(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function ymdParts(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function addDays(ymd: string, days: number) {
  const { year, month, day } = ymdParts(ymd);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function monthBounds(ymd: string) {
  const from = `${ymd.slice(0, 7)}-01`;
  const { year, month } = ymdParts(from);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${from.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

export function rangeForPreset(preset: DatePreset, timeZone: string, now = new Date()): { from: string; to: string } {
  const today = todayYmd(timeZone, now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (preset === "last_7") return { from: addDays(today, -6), to: today };
  if (preset === "last_30") return { from: addDays(today, -29), to: today };
  if (preset === "this_month") return monthBounds(today);
  if (preset === "last_month") {
    const previous = addDays(monthBounds(today).from, -1);
    return monthBounds(previous);
  }
  if (preset === "this_quarter") {
    const month = Number(today.slice(5, 7));
    const year = today.slice(0, 4);
    const startMonth = Math.floor((month - 1) / 3) * 3 + 1;
    const from = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const endMonth = startMonth + 2;
    const last = new Date(Date.UTC(Number(year), endMonth, 0)).getUTCDate();
    return { from, to: `${year}-${String(endMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
  }
  if (preset === "this_year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return monthBounds(today);
}

export function matchPreset(from: string, to: string, timeZone: string, now = new Date()): DatePreset {
  for (const preset of DATE_PRESETS) {
    if (preset.id === "custom") continue;
    const range = rangeForPreset(preset.id, timeZone, now);
    if (range.from === from && range.to === to) return preset.id;
  }
  return "custom";
}

export function defaultAnalyticsRange(timeZone: string, now = new Date()) {
  return rangeForPreset("this_month", timeZone, now);
}

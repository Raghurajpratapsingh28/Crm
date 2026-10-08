const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIanaTimeZone(timeZone: string) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(timeZone: string | null | undefined) {
  if (timeZone && isValidIanaTimeZone(timeZone)) return timeZone;
  return "UTC";
}

function tzOffsetMs(utcInstant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcInstant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - utcInstant.getTime();
}

function ymdParts(ymd: string) {
  const [year, month, day] = ymd.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 };
}

export function addCalendarDays(ymd: string, days: number) {
  const { year, month, day } = ymdParts(ymd);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function addCalendarMonths(ymd: string, months: number) {
  const { year, month, day } = ymdParts(ymd);
  const start = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  const clamped = Math.min(day, last);
  return `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
}

/** UTC instant for YYYY-MM-DD 00:00:00 in `timeZone`. */
export function zonedStartUtc(ymd: string, timeZone: string) {
  const match = DATE.exec(ymd);
  if (!match) throw new Error("invalid date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const tz = resolveTimeZone(timeZone);
  const first = new Date(utcGuess.getTime() - tzOffsetMs(utcGuess, tz));
  return new Date(utcGuess.getTime() - tzOffsetMs(first, tz));
}

export function zonedEndExclusiveUtc(inclusiveToYmd: string, timeZone: string) {
  return zonedStartUtc(addCalendarDays(inclusiveToYmd, 1), timeZone);
}

export function todayYmd(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: resolveTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function thisMonthRange(timeZone: string, now = new Date()) {
  const today = todayYmd(timeZone, now);
  const from = `${today.slice(0, 7)}-01`;
  const { year, month } = ymdParts(from);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${today.slice(0, 7)}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export function inclusiveDayCount(fromYmd: string, toYmd: string) {
  const from = Date.parse(`${fromYmd}T00:00:00.000Z`);
  const to = Date.parse(`${toYmd}T00:00:00.000Z`);
  return Math.floor((to - from) / 86400000) + 1;
}

export function previousEqualRange(fromYmd: string, toYmd: string) {
  const days = inclusiveDayCount(fromYmd, toYmd);
  const previousTo = addCalendarDays(fromYmd, -1);
  const previousFrom = addCalendarDays(fromYmd, -days);
  return { from: previousFrom, to: previousTo };
}

/** ISO week label matching PostgreSQL `to_char(..., 'IYYY-"W"IW')`. */
export function isoWeekLabel(ymd: string) {
  const { year, month, day } = ymdParts(ymd);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

export function enumeratePeriods(fromYmd: string, toInclusiveYmd: string, groupBy: "day" | "week" | "month") {
  const periods: string[] = [];
  if (groupBy === "day") {
    let current = fromYmd;
    while (current <= toInclusiveYmd) {
      periods.push(current);
      current = addCalendarDays(current, 1);
    }
    return periods;
  }
  if (groupBy === "month") {
    let current = `${fromYmd.slice(0, 7)}-01`;
    const endMonth = toInclusiveYmd.slice(0, 7);
    while (current.slice(0, 7) <= endMonth) {
      periods.push(current.slice(0, 7));
      current = addCalendarMonths(current, 1);
    }
    return periods;
  }
  const seen = new Set<string>();
  let current = fromYmd;
  while (current <= toInclusiveYmd) {
    const label = isoWeekLabel(current);
    if (!seen.has(label)) {
      seen.add(label);
      periods.push(label);
    }
    current = addCalendarDays(current, 1);
  }
  return periods;
}

export function postgresPeriodFormat(groupBy: "day" | "week" | "month") {
  if (groupBy === "day") return "YYYY-MM-DD";
  if (groupBy === "week") return `IYYY-"W"IW`;
  return "YYYY-MM";
}

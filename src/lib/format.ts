import { config } from "./config.ts";

const { locale, timezone } = config;

/* Intl formatters are expensive to construct and this page runs for weeks,
   so build each one once. */

const clockTime = new Intl.DateTimeFormat(locale, {
  hour: "2-digit",
  minute: "2-digit",
  // h23 rather than hour12:false -- the latter renders midnight as 24:00 in
  // some locales, which would be wrong on screen for an hour every night.
  hourCycle: "h23",
  timeZone: timezone,
});

const clockDate = new Intl.DateTimeFormat(locale, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: timezone,
});

const hourOnly = new Intl.DateTimeFormat(locale, {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: timezone,
});

const weekdayShort = new Intl.DateTimeFormat(locale, {
  weekday: "short",
  timeZone: timezone,
});

const dayMonth = new Intl.DateTimeFormat(locale, {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: timezone,
});

/** Compact form for places where the date is set in display type and a long
 *  weekday would wrap -- "Wednesday 9 Sept" is ~700px at 72px, wider than the
 *  bins tile. */
const dayMonthShort = new Intl.DateTimeFormat(locale, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: timezone,
});

export const formatClockTime = (d: Date): string => clockTime.format(d);
export const formatClockDate = (d: Date): string => clockDate.format(d);
export const formatHour = (iso: string): string => hourOnly.format(new Date(iso));
export const formatWeekdayShort = (iso: string): string =>
  weekdayShort.format(new Date(iso));
export const formatDayMonth = (iso: string): string =>
  dayMonth.format(new Date(iso));

export const formatTemp = (c: number): string => `${Math.round(c)}°`;

export function formatMoney(value: number, currency: string): string {
  // Crypto spans several orders of magnitude; a fixed 2dp would render either
  // noise or nothing useful depending on the coin.
  const maximumFractionDigits = value >= 1000 ? 0 : value >= 1 ? 2 : 4;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits,
  }).format(value);
}

export function formatSignedPct(pct: number): string {
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

/** Compact age for staleness markers: "4m", "2h", "3d". */
export function formatAge(fromIso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** Calendar-day difference in the configured timezone, so "Tomorrow" does not
 *  flip an hour early or late around a DST boundary. */
const isoDateFmt = new Intl.DateTimeFormat("en-CA", { timeZone: timezone });

export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const today = isoDateFmt.format(now);
  const a = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

export function relativeDayLabel(isoDate: string, now: Date = new Date()): string {
  const delta = daysUntil(isoDate, now);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  return formatDayMonth(isoDate);
}

/** Same, but compact enough to set in display type without wrapping. */
export function relativeDayLabelShort(
  isoDate: string,
  now: Date = new Date(),
): string {
  const delta = daysUntil(isoDate, now);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  return dayMonthShort.format(new Date(isoDate));
}

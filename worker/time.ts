/**
 * All scheduling decisions -- the morning window, which day a bin is collected
 * -- are made in the configured timezone, never the Worker's UTC clock or the
 * TV's. Getting this wrong shows up twice a year at a DST boundary, on a
 * screen nobody is watching closely enough to notice for a while.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ZonedNow {
  /** YYYY-MM-DD in the target zone. */
  date: string;
  hour: number;
  minute: number;
  /** Minutes since local midnight, for comparing against a HH:MM window. */
  minutesOfDay: number;
  /** 0 = Sunday. */
  weekday: number;
}

export function zonedNow(now: Date, timeZone: string): ZonedNow {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);

  const [hourRaw, minuteRaw] = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(now)
    .split(":");

  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(now);

  const hour = Number(hourRaw ?? "0");
  const minute = Number(minuteRaw ?? "0");
  const weekday = WEEKDAYS.indexOf(weekdayName as (typeof WEEKDAYS)[number]);

  return {
    date,
    hour,
    minute,
    minutesOfDay: hour * 60 + minute,
    weekday: weekday === -1 ? 0 : weekday,
  };
}

/** "06:00" -> 360. Returns null for anything malformed so callers can fall back. */
export function parseHhMm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (match === null) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Whole days between two YYYY-MM-DD strings, calendar-accurate. */
export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const parse = (d: string) =>
    Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((parse(toIsoDate) - parse(fromIsoDate)) / 86_400_000);
}

/** Adds whole days to a YYYY-MM-DD string, returning the same format. */
export function addDays(isoDate: string, days: number): string {
  const base = Date.UTC(
    Number(isoDate.slice(0, 4)),
    Number(isoDate.slice(5, 7)) - 1,
    Number(isoDate.slice(8, 10)),
  );
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

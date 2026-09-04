import { config } from "../lib/config.ts";
import { nightOverride } from "../lib/params.ts";

/** Handles a window that wraps midnight, e.g. 22:00 to 07:00. */
export function isNightHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Whether the dim palette should be active. Derived from the clock the board
 * already ticks once a minute rather than owning a timer of its own -- one
 * fewer thing to leak over a month of uptime.
 */
export function useNightDim(now: Date): boolean {
  if (nightOverride !== null) return nightOverride;

  // Read the hour in the configured zone, not the device's.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: config.timezone,
    }).format(now),
  );

  return isNightHour(hour, config.nightStartHour, config.nightEndHour);
}

import { config } from "../lib/config.ts";
import { nightOverride } from "../lib/params.ts";

/** Handles a window that wraps midnight, e.g. 22:00 to 07:00. */
export function isNightHour(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * The hour in the configured zone, not the device's -- the board is not
 * allowed to depend on the TV's clock being set correctly.
 *
 * Exported because the palette is no longer the only thing on a schedule:
 * the traffic map blanks itself on a window of its own, which starts an hour
 * later than the dim does.
 */
export function zonedHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: config.timezone,
    }).format(now),
  );
}

/**
 * Whether the dim palette should be active. Derived from the clock the board
 * already ticks once a minute rather than owning a timer of its own -- one
 * fewer thing to leak over a month of uptime.
 */
export function useNightDim(now: Date): boolean {
  if (nightOverride !== null) return nightOverride;

  return isNightHour(zonedHour(now), config.nightStartHour, config.nightEndHour);
}

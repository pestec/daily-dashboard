import { useEffect } from "react";
import { config } from "../lib/config.ts";

function msUntilNext(hour: number, from: Date = new Date()): number {
  const target = new Date(from);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= from.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - from.getTime();
}

/**
 * Reloads the page once a day at a quiet hour, to clear anything that has
 * drifted over a long run -- detached nodes, a wedged WebView, a stale bundle
 * after a deploy.
 *
 * setTimeout is capped at ~24.8 days, and a single long timer is also the
 * first thing a throttling WebView gets wrong, so this re-arms in chunks of at
 * most an hour and re-checks the wall clock each time rather than trusting one
 * long sleep to fire when it should.
 */
export function useDailyReload(): void {
  useEffect(() => {
    const hour = config.reloadHour;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return;

    let timer: number | undefined;

    const tick = () => {
      const remaining = msUntilNext(hour);
      if (remaining <= 60_000) {
        location.reload();
        return;
      }
      timer = window.setTimeout(tick, Math.min(remaining, 3_600_000));
    };

    timer = window.setTimeout(tick, Math.min(msUntilNext(hour), 3_600_000));
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);
}

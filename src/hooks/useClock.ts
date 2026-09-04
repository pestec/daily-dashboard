import { useEffect, useState } from "react";

/**
 * A Date that updates on the minute boundary. The board shows HH:MM, so
 * ticking every second would repaint 60x more often than anything changes --
 * for weeks -- and buy nothing.
 *
 * Re-aligns to the wall clock on every tick rather than repeating a fixed
 * interval, so it cannot drift or double-fire after the device throttles
 * timers.
 */
export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      // +50ms so we land just after the boundary, never a hair before it.
      const msToNextMinute = 60_000 - (Date.now() % 60_000) + 50;
      timer = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, msToNextMinute);
    };

    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  return now;
}

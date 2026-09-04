import { formatClockDate, formatClockTime } from "../../lib/format.ts";

interface Props {
  now: Date;
}

/**
 * 24-hour, zero-padded, tabular. Seconds are deliberately not shown: a
 * per-second repaint for weeks buys nothing on a wall display, and the digits
 * would shimmer from across the room.
 *
 * The time is sized against the tile's own width rather than a fixed px value,
 * because the clock occupies a narrower cell in morning mode -- a hard 180px
 * clips "10:46" there. Capped so it never outgrows the ambient layout.
 */
export function ClockTile({ now }: Props) {
  return (
    <section className="area-clock @container flex min-h-0 min-w-0 flex-col justify-center gap-4 overflow-hidden rounded-2xl border border-border/40 bg-surface p-8">
      <time
        className="tnum leading-none font-semibold"
        style={{ fontSize: "min(180px, 30cqw)" }}
        dateTime={now.toISOString()}
      >
        {formatClockTime(now)}
      </time>
      <p className="text-title leading-none text-fg-muted">
        {formatClockDate(now)}
      </p>
    </section>
  );
}

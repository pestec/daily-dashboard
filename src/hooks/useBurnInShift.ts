import { useEffect, useState } from "react";
import { config } from "../lib/config.ts";

/** Eight positions around a small box. Walking the perimeter moves every
 *  pixel further over a full cycle than jittering randomly would. */
const OFFSETS: ReadonlyArray<readonly [x: number, y: number]> = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

export interface BurnInOffset {
  x: number;
  y: number;
}

/**
 * Walks the perimeter above at `px` radius, one step every `minutes`.
 *
 * Exported separately from the board's own shift because the traffic map runs
 * a second, larger cycle of its own inside its tile. Give the two different
 * periods rather than different starting points: on the same period they stay
 * locked in a fixed relationship and the combined movement is just one bigger
 * step, which is the opposite of what either is for.
 */
export function useSlowOffset(px: number, minutes: number): BurnInOffset {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (px <= 0 || minutes <= 0) return;

    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % OFFSETS.length),
      minutes * 60_000,
    );
    return () => window.clearInterval(timer);
  }, [px, minutes]);

  const offset = OFFSETS[index % OFFSETS.length] ?? [0, 0];
  return { x: offset[0] * px, y: offset[1] * px };
}

/**
 * Nudges the whole board by a few pixels on a slow cycle so no static element
 * -- the clock especially -- sits on the same pixels for weeks.
 *
 * The step is small and the CSS transition is long, so from a sofa the move is
 * invisible; it is only doing anything at all over a timescale of days.
 */
export function useBurnInShift(): BurnInOffset {
  return useSlowOffset(config.burnInPx, config.burnInMinutes);
}

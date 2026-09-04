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
 * Nudges the whole board by a few pixels on a slow cycle so no static element
 * -- the clock especially -- sits on the same pixels for weeks.
 *
 * The step is small and the CSS transition is long, so from a sofa the move is
 * invisible; it is only doing anything at all over a timescale of days.
 */
export function useBurnInShift(): BurnInOffset {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (config.burnInPx <= 0 || config.burnInMinutes <= 0) return;

    const periodMs = config.burnInMinutes * 60_000;
    const timer = window.setInterval(
      () => setIndex((i) => (i + 1) % OFFSETS.length),
      periodMs,
    );
    return () => window.clearInterval(timer);
  }, []);

  const offset = OFFSETS[index % OFFSETS.length] ?? [0, 0];
  return { x: offset[0] * config.burnInPx, y: offset[1] * config.burnInPx };
}

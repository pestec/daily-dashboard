/**
 * Temperature -> colour ramp for the seven-day range bars.
 *
 * The bars are the only place on the board where a number is encoded as a
 * hue, so the ramp has to survive the night-dim palette and a three-metre
 * viewing distance: cold reads blue, mild reads cyan/green, hot reads amber
 * to red, with no two adjacent stops closer than about six degrees.
 */

type Rgb = readonly [number, number, number];

const STOPS: ReadonlyArray<readonly [number, Rgb]> = [
  [-8, [96, 165, 250]],
  [2, [56, 189, 248]],
  [9, [34, 211, 238]],
  [15, [52, 211, 153]],
  [21, [250, 204, 21]],
  [27, [249, 115, 22]],
  [34, [239, 68, 68]],
];

const mix = (a: Rgb, b: Rgb, t: number): string =>
  `rgb(${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t)).join(" ")})`;

/** Clamped at both ends, so an unseasonable reading still gets a colour. */
export function tempColor(celsius: number): string {
  const first = STOPS[0];
  const last = STOPS[STOPS.length - 1];
  if (first === undefined || last === undefined) return "rgb(148 163 184)";
  if (celsius <= first[0]) return mix(first[1], first[1], 0);
  if (celsius >= last[0]) return mix(last[1], last[1], 0);

  for (let i = 1; i < STOPS.length; i += 1) {
    const lo = STOPS[i - 1];
    const hi = STOPS[i];
    if (lo === undefined || hi === undefined) continue;
    if (celsius <= hi[0]) {
      return mix(lo[1], hi[1], (celsius - lo[0]) / (hi[0] - lo[0]));
    }
  }
  return mix(last[1], last[1], 0);
}

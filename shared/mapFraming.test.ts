import assert from "node:assert/strict";
import test from "node:test";

import {
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  clampMapZoom,
  zoomForLongitudeSpan,
} from "./mapFraming.ts";

/**
 * The anchor case, in the shape the board actually runs it: the focus slot is
 * 1229px wide on the 1920x1080 board, and the limits are a little over a fifth
 * of a degree apart -- roughly the sixteen kilometres between two landmarks on
 * either side of the area this dashboard watches.
 *
 * Checked against the projection by hand rather than against the
 * implementation: 0.2335 degrees over 1229px is 1229*360/(256*0.2335) = 7401
 * world-widths, and log2(7401) is 12.85. A version of this that returned 11.85
 * or 13.85 would still look like a map of the right place, which is the whole
 * reason this test exists.
 */
test("a span and a width give the zoom that fits one exactly in the other", () => {
  const zoom = zoomForLongitudeSpan(0.2335, 1229);
  assert.ok(zoom !== null);
  assert.ok(Math.abs(zoom - 12.854) < 0.01, `got ${zoom}`);
});

/** Halving the width is one doubling further out, whatever the numbers. */
test("halving the container is exactly one zoom step out", () => {
  const wide = zoomForLongitudeSpan(0.2335, 1229);
  const half = zoomForLongitudeSpan(0.2335, 614.5);
  assert.ok(wide !== null && half !== null);
  assert.ok(Math.abs(wide - half - 1) < 1e-9, `${wide} vs ${half}`);
});

/** And doubling the span is the same step, from the other side. Both spans
 *  are kept inside the clamp range on purpose -- outside it the relationship
 *  stops holding, which is the clamp doing its job rather than a bug. */
test("doubling the span is exactly one zoom step out", () => {
  const tight = zoomForLongitudeSpan(0.2, 1229);
  const loose = zoomForLongitudeSpan(0.4, 1229);
  assert.ok(tight !== null && loose !== null);
  assert.ok(Math.abs(tight - loose - 1) < 1e-9, `${tight} vs ${loose}`);
});

/**
 * A span small enough to want zoom 17 has to come back as something the
 * traffic layer still draws. The framing is wrong either way at that point,
 * but a clamped map is wrong in a way you can see and fix; an unclamped one
 * renders a perfectly convincing street map with no traffic on it at all.
 */
test("a zoom the traffic layer cannot serve is clamped into range", () => {
  assert.equal(zoomForLongitudeSpan(0.001, 1229), MAP_ZOOM_MAX);
  assert.equal(zoomForLongitudeSpan(50, 1229), MAP_ZOOM_MIN);
  assert.equal(clampMapZoom(0), MAP_ZOOM_MIN);
  assert.equal(clampMapZoom(99), MAP_ZOOM_MAX);
  assert.equal(clampMapZoom(12.5), 12.5);
});

/** Nothing here may return a number it cannot stand behind. A container that
 *  has not been laid out yet is the realistic one: the tile falls back to its
 *  configured zoom rather than framing against a width of zero. */
test("input that cannot describe a frame returns null, not a guess", () => {
  assert.equal(zoomForLongitudeSpan(0, 1229), null);
  assert.equal(zoomForLongitudeSpan(-0.5, 1229), null);
  assert.equal(zoomForLongitudeSpan(0.2335, 0), null);
  assert.equal(zoomForLongitudeSpan(0.2335, Number.NaN), null);
  assert.equal(zoomForLongitudeSpan(Number.NaN, 1229), null);
});

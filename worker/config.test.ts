import assert from "node:assert/strict";
import test from "node:test";

import { readConfig } from "./config.ts";
import type { Env } from "./env.ts";

function envWith(overrides: Record<string, string>): Env {
  return overrides as unknown as Env;
}

/**
 * These four variables are declared in wrangler.jsonc, documented in
 * .env.example, and the README tells you to set them in the dashboard so real
 * addresses stay out of the repo -- but `readConfig` used hardcoded constants
 * and never read them, so setting them did nothing and the failure was
 * invisible: a commute from the wrong place still returns a plausible time.
 */
/* Deliberately not real places, and nowhere near the ones this repo is
   configured for -- a test that asserts the wiring works by pasting the real
   addresses into the repo would reintroduce exactly what this file exists to
   prevent. The digits only need to survive the trip through readConfig intact,
   so they carry enough decimal places to catch any rounding on the way. */
test("commute endpoints come from the environment", () => {
  const config = readConfig(envWith({
    HOME_LAT: "12.3456789",
    HOME_LON: "-98.7654321",
    WORK_LAT: "23.4567891",
    WORK_LON: "-87.6543219",
  }));

  assert.deepEqual(config.commute.home, {
    lat: 12.3456789,
    lon: -98.7654321,
  });
  assert.deepEqual(config.commute.work, {
    lat: 23.4567891,
    lon: -87.6543219,
  });
});

test("a missing location variable falls back to a placeholder, not a real place", () => {
  const config = readConfig(envWith({}));

  // The two ends must stay distinguishable, so an unset variable shows up as a
  // nonsense central-London hop rather than a zero-length route that reads as
  // a plausible "you live at work" commute.
  assert.notDeepEqual(config.commute.home, config.commute.work);

  for (const point of [config.commute.home, config.commute.work]) {
    assert.ok(Number.isFinite(point.lat) && Number.isFinite(point.lon));
  }
});

test("blank and malformed coordinates fall back rather than becoming NaN", () => {
  const config = readConfig(envWith({ WORK_LAT: "", WORK_LON: "not-a-number" }));

  assert.ok(Number.isFinite(config.commute.work.lat));
  assert.ok(Number.isFinite(config.commute.work.lon));
});

/* -------------------------------------------------------------------------- */
/* Traffic map                                                                 */
/* -------------------------------------------------------------------------- */

test("the map centres on the commute's home end by default", () => {
  const config = readConfig(envWith({
    HOME_LAT: "12.3456789",
    HOME_LON: "-98.7654321",
  }));

  assert.equal(config.map.lat, 12.3456789);
  assert.equal(config.map.lon, -98.7654321);
});

test("MAP_LAT and MAP_LON offset the view away from the house", () => {
  const config = readConfig(envWith({
    HOME_LAT: "12.3456789",
    HOME_LON: "-98.7654321",
    MAP_LAT: "23.4567891",
    MAP_LON: "-87.6543219",
  }));

  assert.equal(config.map.lat, 23.4567891);
  assert.equal(config.map.lon, -87.6543219);
  // The commute is unaffected: these two centre a picture, they do not move
  // either end of the route.
  assert.equal(config.commute.home.lat, 12.3456789);
});

/**
 * The zoom is the one setting meant to be retuned from the dashboard while
 * looking at the TV, which is exactly how a "0", a "25" or a stray letter ends
 * up in it. Every one of those has to land somewhere the traffic layer still
 * draws, because the failure is silent: an out-of-range zoom renders a map,
 * just not one with any traffic on it.
 */
test("map zoom is clamped to the range the traffic layer is useful over", () => {
  assert.equal(readConfig(envWith({})).map.zoom, 11);
  assert.equal(readConfig(envWith({ MAP_ZOOM: "13" })).map.zoom, 13);
  assert.equal(readConfig(envWith({ MAP_ZOOM: "0" })).map.zoom, 9);
  assert.equal(readConfig(envWith({ MAP_ZOOM: "25" })).map.zoom, 14);
  assert.equal(readConfig(envWith({ MAP_ZOOM: "12.6" })).map.zoom, 13);
  assert.equal(readConfig(envWith({ MAP_ZOOM: "" })).map.zoom, 11);
  assert.equal(readConfig(envWith({ MAP_ZOOM: "wide" })).map.zoom, 11);
});

test("an unset map id stays null rather than becoming an empty style id", () => {
  assert.equal(readConfig(envWith({})).map.mapId, null);
  assert.equal(readConfig(envWith({ MAP_ID: "" })).map.mapId, null);
  assert.equal(readConfig(envWith({ MAP_ID: "abc123" })).map.mapId, "abc123");
});

/**
 * The framing the board actually runs on: two longitudes, naming what should
 * sit at the tile's left and right edges.
 *
 * Every rejection below falls back to MAP_ZOOM rather than half-applying. A
 * frame built from one limit, or from a pair in the wrong order, is not a
 * near-miss -- it is a map of somewhere else, rendered with total confidence.
 */
test("both map limits pass through when they are set and in order", () => {
  const config = readConfig(envWith({
    MAP_WEST_LON: "-1.2345678",
    MAP_EAST_LON: "0.9876543",
  }));

  assert.equal(config.map.westLon, -1.2345678);
  assert.equal(config.map.eastLon, 0.9876543);
});

test("a half-configured or reversed pair of limits falls back to the zoom", () => {
  const none = { westLon: null, eastLon: null };

  // One on its own says nothing about how wide the view should be.
  assert.deepEqual(pickLimits(readConfig(envWith({ MAP_WEST_LON: "0.05" }))), none);
  assert.deepEqual(pickLimits(readConfig(envWith({ MAP_EAST_LON: "0.28" }))), none);

  // Reversed: the span would come out negative.
  assert.deepEqual(
    pickLimits(readConfig(envWith({ MAP_WEST_LON: "0.28", MAP_EAST_LON: "0.05" }))),
    none,
  );

  // Equal: a span of nothing, which is a zoom of infinity.
  assert.deepEqual(
    pickLimits(readConfig(envWith({ MAP_WEST_LON: "0.1", MAP_EAST_LON: "0.1" }))),
    none,
  );

  // Blank and malformed, the two shapes an unset dashboard var really takes.
  assert.deepEqual(
    pickLimits(readConfig(envWith({ MAP_WEST_LON: "", MAP_EAST_LON: "0.28" }))),
    none,
  );
  assert.deepEqual(
    pickLimits(readConfig(envWith({ MAP_WEST_LON: "west", MAP_EAST_LON: "0.28" }))),
    none,
  );
});

/** The zoom stays available underneath the limits, as the fallback they
 *  degrade to. */
test("limits do not disturb the fallback zoom or the vertical centre", () => {
  const config = readConfig(envWith({
    HOME_LAT: "12.3456789",
    MAP_ZOOM: "13",
    MAP_WEST_LON: "0.05",
    MAP_EAST_LON: "0.28",
  }));

  assert.equal(config.map.zoom, 13);
  assert.equal(config.map.lat, 12.3456789);
});

function pickLimits(config: ReturnType<typeof readConfig>) {
  return { westLon: config.map.westLon, eastLon: config.map.eastLon };
}

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

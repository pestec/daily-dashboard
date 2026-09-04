import assert from "node:assert/strict";
import test from "node:test";

import type { Config } from "../config.ts";
import {
  activeCommuteSlot,
  legForSlot,
  parseDurationSeconds,
  parseGoogleRouteTiming,
} from "./commute.ts";

const CONFIG: Config = {
  timezone: "UTC",
  weather: { lat: 0, lon: 0, label: "Home" },
  commute: {
    home: { lat: 1, lon: 1 },
    homeLabel: "Home",
    work: { lat: 2, lon: 2 },
    workLabel: "Work",
    morningStartMinutes: 5 * 60 + 30,
    morningEndMinutes: 9 * 60,
    afternoonStartMinutes: 15 * 60,
    afternoonEndMinutes: 19 * 60,
    days: [1, 2, 3, 4, 5],
  },
  tfl: { roadIds: [], lineModes: [] },
  crypto: { ids: [], vsCurrency: "gbp" },
  bins: { provider: "manual", rules: [] },
};

test("parseDurationSeconds handles Google protobuf duration strings", () => {
  assert.equal(parseDurationSeconds("1263s"), 1263);
  assert.equal(parseDurationSeconds("1263.4s"), 1263.4);
});

test("parseGoogleRouteTiming derives delay from duration - staticDuration", () => {
  const timing = parseGoogleRouteTiming({
    routes: [
      {
        duration: "1263s",
        staticDuration: "1020s",
        distanceMeters: 13456,
      },
    ],
  });

  assert.equal(timing.durationSeconds, 1263);
  assert.equal(timing.staticDurationSeconds, 1020);
  assert.equal(timing.delaySeconds, 243);
  assert.equal(timing.distanceMeters, 13456);
});

test("activeCommuteSlot selects morning and afternoon windows", () => {
  assert.equal(activeCommuteSlot(CONFIG, new Date("2026-09-04T06:45:00Z")), "morning");
  assert.equal(activeCommuteSlot(CONFIG, new Date("2026-09-04T16:10:00Z")), "afternoon");
  assert.equal(activeCommuteSlot(CONFIG, new Date("2026-09-04T12:00:00Z")), null);
  assert.equal(activeCommuteSlot(CONFIG, new Date("2026-09-06T07:00:00Z")), null);
});

test("legForSlot flips journey direction by slot", () => {
  const morning = legForSlot(CONFIG, "morning");
  const afternoon = legForSlot(CONFIG, "afternoon");

  assert.equal(morning.origin.label, "Home");
  assert.equal(morning.destination.label, "Work");
  assert.equal(afternoon.origin.label, "Work");
  assert.equal(afternoon.destination.label, "Home");
});

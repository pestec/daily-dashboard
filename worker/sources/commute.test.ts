import assert from "node:assert/strict";
import test from "node:test";

import { parseDurationSeconds, parseGoogleRouteTiming } from "./commute.ts";

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

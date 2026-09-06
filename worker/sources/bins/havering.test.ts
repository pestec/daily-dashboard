import assert from "node:assert/strict";
import test from "node:test";

import { extractHaveringCollectionsFromRows } from "./havering.ts";

const SAME_DAY_ROWS = [
  { service: "Domestic Waste", date: "Friday, September 4th 2026" },
  { service: "Recycling", date: "Friday, September 4th 2026" },
];

const DIFFERENT_DAY_ROWS = [
  { service: "Domestic Waste", date: "Friday, September 11th 2026" },
  { service: "Recycling", date: "Tuesday, September 8th 2026" },
];

test("extractHaveringCollectionsFromRows parses domestic and recycling dates", () => {
  const collections = extractHaveringCollectionsFromRows(SAME_DAY_ROWS);

  assert.equal(collections.length, 1);
  assert.equal(collections[0]?.date, "2026-09-04");
  assert.deepEqual(collections[0]?.kinds.sort(), ["general", "recycling"]);
});

test("extractHaveringCollectionsFromRows separates different collection dates", () => {
  const collections = extractHaveringCollectionsFromRows(DIFFERENT_DAY_ROWS);

  assert.equal(collections.length, 2);
  assert.equal(collections[0]?.date, "2026-09-08");
  assert.deepEqual(collections[0]?.kinds, ["recycling"]);
  assert.equal(collections[1]?.date, "2026-09-11");
  assert.deepEqual(collections[1]?.kinds, ["general"]);
});

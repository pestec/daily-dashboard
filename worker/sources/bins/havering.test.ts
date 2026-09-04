import assert from "node:assert/strict";
import test from "node:test";

import { extractHaveringCollections } from "./havering.ts";

const SAMPLE_HTML = `
<div>
  <h3>Your next collection days</h3>
  <img src="https://portal.havering.gov.uk/DomesticWaste.jpeg" alt="Image" />
  Domestic WasteFriday, September 4th 2026
  <img src="https://portal.havering.gov.uk/Recycling.jpeg" alt="Image" />
  RecyclingFriday, September 4th 2026
</div>
`;

const SAMPLE_HTML_WITH_DIFFERENT_DATES = `
<div>
  <h3>Your next collection days</h3>
  <img src="https://portal.havering.gov.uk/DomesticWaste.jpeg" alt="Image" />
  Domestic Waste Friday, September 11th 2026
  <img src="https://portal.havering.gov.uk/Recycling.jpeg" alt="Image" />
  Recycling Tuesday, September 8th 2026
</div>
`;

test("extractHaveringCollections parses domestic and recycling dates", () => {
  const collections = extractHaveringCollections(SAMPLE_HTML);

  assert.equal(collections.length, 1);
  assert.equal(collections[0]?.date, "2026-09-04");
  assert.deepEqual(collections[0]?.kinds.sort(), ["general", "recycling"]);
});

test("extractHaveringCollections produces separate dates for domestic and recycling", () => {
  const collections = extractHaveringCollections(SAMPLE_HTML_WITH_DIFFERENT_DATES);

  assert.equal(collections.length, 2);
  assert.equal(collections[0]?.date, "2026-09-08");
  assert.deepEqual(collections[0]?.kinds, ["recycling"]);
  assert.equal(collections[1]?.date, "2026-09-11");
  assert.deepEqual(collections[1]?.kinds, ["general"]);
});

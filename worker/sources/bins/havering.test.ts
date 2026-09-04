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

test("extractHaveringCollections parses domestic and recycling dates", () => {
  const collections = extractHaveringCollections(SAMPLE_HTML);

  assert.equal(collections.length, 1);
  assert.equal(collections[0]?.date, "2026-09-04");
  assert.deepEqual(collections[0]?.kinds.sort(), ["general", "recycling"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { extractHaveringCollections, extractHaveringCollectionsFromApi } from "./havering.ts";

const SAMPLE_HTML = `
<div>
  <h3>Your next collection days</h3>
  <img src="https://portal.havering.gov.uk/DomesticWaste.jpeg" alt="Image" />
  Domestic WasteFriday, September 4th 2026
  <img src="https://portal.havering.gov.uk/Recycling.jpeg" alt="Image" />
  RecyclingFriday, September 4th 2026
</div>
`;

const SAMPLE_HTML_VARIANTS = `
<div>
  <h3>Your next collection days</h3>
  <img src="https://portal.havering.gov.uk/ResidualWaste.jpeg" alt="Image" />
  Residual WasteWednesday, Sept 9th 2026
  <img src="https://portal.havering.gov.uk/Recycling.jpeg" alt="Image" />
  Mixed RecyclingWednesday, Sept 9th 2026
  <img src="https://portal.havering.gov.uk/GardenWaste.jpeg" alt="Image" />
  Garden WasteWednesday, Sept 9th 2026
  <img src="https://portal.havering.gov.uk/FoodWaste.jpeg" alt="Image" />
  Food WasteWednesday, Sept 9th 2026
</div>
`;

test("extractHaveringCollections parses domestic and recycling dates", () => {
  const collections = extractHaveringCollections(SAMPLE_HTML);

  assert.equal(collections.length, 1);
  assert.equal(collections[0]?.date, "2026-09-04");
  assert.deepEqual(collections[0]?.kinds.sort(), ["general", "recycling"]);
});

test("extractHaveringCollections accepts alternate labels and month abbreviations", () => {
  const collections = extractHaveringCollections(SAMPLE_HTML_VARIANTS);

  assert.equal(collections.length, 1);
  assert.equal(collections[0]?.date, "2026-09-09");
  assert.deepEqual(collections[0]?.kinds.sort(), [
    "food",
    "garden",
    "general",
    "recycling",
  ]);
});

test("extractHaveringCollectionsFromApi parses service/date records", () => {
  const payload = {
    getCollectionByUprnAndDateResponse: {
      getCollectionByUprnAndDateResult: {
        Collections: [
          { service: "Service - Domestic Waste", date: "04/09/2026" },
          { service: "Service - Recycling", date: "04/09/2026" },
          { service: "Service - Garden Waste Winter", date: "11/09/2026" },
        ],
      },
    },
  };

  const collections = extractHaveringCollectionsFromApi(payload);
  assert.equal(collections.length, 2);
  assert.equal(collections[0]?.date, "2026-09-04");
  assert.deepEqual(collections[0]?.kinds.sort(), ["general", "recycling"]);
  assert.equal(collections[1]?.date, "2026-09-11");
  assert.deepEqual(collections[1]?.kinds, ["garden"]);
});

import { isMockVariant, type MockVariant } from "../../shared/fixtures.ts";

/** Read once at module load. Nothing on this screen changes the URL. */
const params = new URLSearchParams(window.location.search);

/** `?debug` overlays fetch timings, per-source freshness, and errors. */
export const debugEnabled = params.has("debug");

/** `?mock=morning|degraded` picks a fixture, so every layout state --
 *  including the broken ones -- can be put on screen deliberately. */
export const mockVariant: MockVariant = isMockVariant(params.get("mock"))
  ? (params.get("mock") as MockVariant)
  : "ambient";

/** `?night=1` / `?night=0` forces the dim palette regardless of the clock,
 *  so the night look can be reviewed at any hour. */
export const nightOverride: boolean | null = params.has("night")
  ? params.get("night") !== "0"
  : null;

/** `?mode=morning|ambient` forces a layout, for the same reason. */
const rawMode = params.get("mode");
export const modeOverride: "morning" | "ambient" | null =
  rawMode === "morning" || rawMode === "ambient" ? rawMode : null;

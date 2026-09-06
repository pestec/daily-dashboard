import { clampMapZoom } from "../shared/mapFraming.ts";
import type { BinKind } from "../shared/types.ts";
import type { Env } from "./env.ts";
import { parseHhMm } from "./time.ts";

/** One recurring bin rule: a known collection date plus how often it repeats. */
export interface BinRule {
  kinds: BinKind[];
  /** A real collection date, YYYY-MM-DD, used as the phase anchor. */
  anchor: string;
  intervalDays: number;
}

export interface Config {
  timezone: string;
  weather: { lat: number; lon: number; label: string };
  commute: {
    home: { lat: number; lon: number };
    homeLabel: string;
    work: { lat: number; lon: number };
    workLabel: string;
    morningStartMinutes: number;
    morningEndMinutes: number;
    afternoonStartMinutes: number;
    afternoonEndMinutes: number;
    /** ISO-ish weekday numbers, 0 = Sunday. */
    days: number[];
  };
  tfl: { roadIds: string[]; lineModes: string[] };
  map: {
    lat: number;
    lon: number;
    zoom: number;
    westLon: number | null;
    eastLon: number | null;
    mapId: string | null;
  };
  crypto: { ids: string[]; vsCurrency: string };
  bins: { provider: string; rules: BinRule[] };
}

/**
 * Fallbacks for the commute endpoints, and deliberately not anywhere real.
 *
 * These used to be real coordinates, hardcoded, and `readConfig` used them
 * unconditionally -- so HOME_LAT/HOME_LON and WORK_LAT/WORK_LON could be set in
 * the dashboard and have no effect whatsoever, while the addresses the README
 * promises are kept out of the repo sat in this file. The variables are the
 * source of truth now, and these match the placeholders in wrangler.jsonc: a
 * commute leg between two points in central London means a variable is missing
 * rather than wrong.
 */
const PLACEHOLDER_HOME = { lat: 51.5, lon: 0.1 } as const;
const PLACEHOLDER_WORK = { lat: 51.51, lon: 0.12 } as const;

function num(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return raw !== undefined && raw !== "" && Number.isFinite(parsed) ? parsed : fallback;
}

function list(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function listOrDefault(
  raw: string | undefined,
  fallback: readonly string[],
): string[] {
  const values = list(raw);
  return values.length > 0 ? values : [...fallback];
}

/**
 * CoinGecko ids, in the order they should appear on the board. These are ids,
 * not ticker symbols: `link` is Chainlink's symbol but `chainlink` is its id,
 * and getting that wrong silently drops the coin rather than failing loudly.
 *
 * An id CoinGecko does not recognise costs only itself -- the response simply
 * has no entry for it and the strip renders the other nine.
 */
const DEFAULT_CRYPTO_IDS: readonly string[] = [
  "ethereum",
  "bitcoin",
  "uniswap",
  "chainlink",
  "arbitrum",
  "1inch",
  "sei-network",
  "render-token",
  "solana",
  "ondo-finance",
];

/**
 * Zoom for the traffic map, and the range it is allowed to take.
 *
 * The brief was "as far out as possible while still showing live traffic",
 * and the traffic layer is what sets the floor: Google thins it as you zoom
 * out, so somewhere below 10 it stops being a picture of your area and
 * becomes a few coloured motorways on an empty field. The ceiling is the
 * opposite failure -- past 14 the surrounding network falls off the edges and
 * only your own streets are left, which no longer answers "is it bad out
 * there".
 *
 * 11 covers roughly 55km across the width of the tile from a 1920px board,
 * which for an east London centre reaches the M25 in both directions.
 *
 * This is only the fallback now. Set MAP_WEST_LON and MAP_EAST_LON and the
 * board derives the zoom from them instead, which is the better way round:
 * the edges are what anyone actually has an opinion about, and the zoom that
 * puts them there depends on the tile's pixel width. The clamp range lives
 * in shared/mapFraming.ts, since both sides now apply it.
 */
const DEFAULT_MAP_ZOOM = 11;

function mapZoom(raw: string | undefined): number {
  return clampMapZoom(Math.round(num(raw, DEFAULT_MAP_ZOOM)));
}

/**
 * The two longitudes that frame the tile, or nulls.
 *
 * All or nothing, and only in the right order. One limit on its own says
 * nothing about how wide the view should be, and a west that sits east of
 * the east would compute a negative span -- both would silently produce a
 * frame with no relationship to what was asked for, so both fall back to
 * MAP_ZOOM instead, which at least renders a map of the right place.
 */
function mapLimits(
  west: string | undefined,
  east: string | undefined,
): { westLon: number | null; eastLon: number | null } {
  const none = { westLon: null, eastLon: null };

  if (west === undefined || west === "") return none;
  if (east === undefined || east === "") return none;

  const westLon = Number(west);
  const eastLon = Number(east);
  if (!Number.isFinite(westLon) || !Number.isFinite(eastLon)) return none;
  if (westLon >= eastLon) return none;

  return { westLon, eastLon };
}

const VALID_BIN_KINDS: readonly string[] = ["general", "recycling", "garden", "food"];

/** Bad JSON in a var must not take the whole board down, so this degrades to
 *  an empty schedule and the bins tile simply says nothing is scheduled. */
function parseBinRules(raw: string | undefined): BinRule[] {
  if (raw === undefined || raw.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const rules: BinRule[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry as Record<string, unknown>;

    const anchor = candidate["anchor"];
    const intervalDays = candidate["intervalDays"];
    const kinds = candidate["kinds"];

    if (typeof anchor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(anchor)) continue;
    if (typeof intervalDays !== "number" || intervalDays < 1) continue;
    if (!Array.isArray(kinds)) continue;

    const validKinds = kinds.filter(
      (kind): kind is BinKind =>
        typeof kind === "string" && VALID_BIN_KINDS.includes(kind),
    );
    if (validKinds.length === 0) continue;

    rules.push({ kinds: validKinds, anchor, intervalDays });
  }
  return rules;
}

export function readConfig(env: Env): Config {
  return {
    timezone: env.TIMEZONE || "Europe/London",
    weather: {
      lat: num(env.WEATHER_LAT, 51.5),
      lon: num(env.WEATHER_LON, -0.1),
      label: env.WEATHER_LABEL || "Home",
    },
    commute: {
      home: {
        lat: num(env.HOME_LAT, PLACEHOLDER_HOME.lat),
        lon: num(env.HOME_LON, PLACEHOLDER_HOME.lon),
      },
      homeLabel: env.COMMUTE_HOME_LABEL || "Home",
      work: {
        lat: num(env.WORK_LAT, PLACEHOLDER_WORK.lat),
        lon: num(env.WORK_LON, PLACEHOLDER_WORK.lon),
      },
      workLabel: env.COMMUTE_LABEL || "Work",
      morningStartMinutes: parseHhMm(env.COMMUTE_MORNING_WINDOW_START || "") ?? 5 * 60 + 30,
      morningEndMinutes: parseHhMm(env.COMMUTE_MORNING_WINDOW_END || "") ?? 9 * 60,
      afternoonStartMinutes: parseHhMm(env.COMMUTE_AFTERNOON_WINDOW_START || "") ?? 15 * 60,
      afternoonEndMinutes: parseHhMm(env.COMMUTE_AFTERNOON_WINDOW_END || "") ?? 19 * 60,
      days: list(env.COMMUTE_DAYS).map(Number).filter(Number.isInteger),
    },
    tfl: {
      roadIds: listOrDefault(env.TFL_ROAD_IDS, ["a12", "a13", "a406"]),
      lineModes: listOrDefault(env.TFL_LINE_MODES, ["tube"]),
    },
    map: {
      // Defaulting to the commute's home end means the tile is centred on the
      // house with no extra configuration at all; MAP_LAT/MAP_LON exist for
      // the case where you want the view offset towards the roads you
      // actually care about rather than sitting exactly on the roof.
      lat: num(env.MAP_LAT, num(env.HOME_LAT, PLACEHOLDER_HOME.lat)),
      lon: num(env.MAP_LON, num(env.HOME_LON, PLACEHOLDER_HOME.lon)),
      zoom: mapZoom(env.MAP_ZOOM),
      ...mapLimits(env.MAP_WEST_LON, env.MAP_EAST_LON),
      mapId: env.MAP_ID !== undefined && env.MAP_ID !== "" ? env.MAP_ID : null,
    },
    crypto: {
      ids: listOrDefault(env.CRYPTO_IDS, DEFAULT_CRYPTO_IDS),
      vsCurrency: (env.CRYPTO_VS || "usd").toLowerCase(),
    },
    bins: {
      provider: env.BIN_PROVIDER || "havering",
      rules: parseBinRules(env.BIN_SCHEDULE),
    },
  };
}

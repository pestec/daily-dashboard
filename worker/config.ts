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
    /** A zoom pinned by hand, which overrides anything derived. Null to let
     *  the limits decide. */
    zoom: number | null;
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
 * A pair of limits along one axis, or null.
 *
 * All or nothing, and only in the right order. One limit on its own says
 * nothing about where the view should sit, and a pair the wrong way round
 * spans a negative distance -- both would silently produce a frame with no
 * relationship to what was asked for, so neither is half-applied.
 */
function limitPair(
  lowRaw: string | undefined,
  highRaw: string | undefined,
): { low: number; high: number } | null {
  if (lowRaw === undefined || lowRaw === "") return null;
  if (highRaw === undefined || highRaw === "") return null;

  const low = Number(lowRaw);
  const high = Number(highRaw);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low >= high) return null;

  return { low, high };
}

const midpoint = (pair: { low: number; high: number }): number =>
  (pair.low + pair.high) / 2;

/**
 * A zoom pinned by hand, or null to let the limits decide.
 *
 * Pinning wins over the zoom derived from MAP_WEST_LON/MAP_EAST_LON, which
 * is the only arrangement that makes this a usable knob: the edges get the
 * framing into the right area, and then this is what you turn while looking
 * at the screen. The limits still set the centre when it is pinned, so
 * turning it zooms into the middle of the frame they describe rather than
 * jumping somewhere else.
 *
 * The distinction is between "absent" and "set", not between values -- which
 * is why this reads the raw var rather than going through num() with a
 * default, since that cannot tell an unset var from one set to 11.
 */
function pinnedZoom(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;

  const zoom = Number(raw);
  if (!Number.isFinite(zoom)) return null;

  return clampMapZoom(zoom);
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

/**
 * Where the traffic map looks, from four optional pairs of limits and a pin.
 *
 * Both axes work the same way: name what should sit at the two edges and the
 * centre falls out as the midpoint. They are not symmetrical in what else
 * they do, though, and cannot be made so. East and west also decide the
 * zoom, because longitude maps linearly onto the tile's width. North and
 * south only move the view up and down -- a map covers ground in proportion
 * to its container, so once the width is fixed the height is fixed with it,
 * and there is no arrangement of two latitudes that changes that. Asking for
 * a taller view means a taller tile.
 *
 * Everything is optional and everything degrades to the layer beneath it:
 * limits, then MAP_LAT/MAP_LON, then the commute's home end -- which means
 * the tile is centred on the house with no map configuration at all.
 */
function mapConfig(env: Env): Config["map"] {
  const horizontal = limitPair(env.MAP_WEST_LON, env.MAP_EAST_LON);
  const vertical = limitPair(env.MAP_SOUTH_LAT, env.MAP_NORTH_LAT);

  return {
    lat:
      vertical !== null
        ? midpoint(vertical)
        : num(env.MAP_LAT, num(env.HOME_LAT, PLACEHOLDER_HOME.lat)),
    lon:
      horizontal !== null
        ? midpoint(horizontal)
        : num(env.MAP_LON, num(env.HOME_LON, PLACEHOLDER_HOME.lon)),
    zoom: pinnedZoom(env.MAP_ZOOM),
    // Still sent even when the zoom is pinned: the board needs the span to
    // report what the limits would have given, and sending them
    // conditionally would make /api/board lie about the configuration.
    westLon: horizontal?.low ?? null,
    eastLon: horizontal?.high ?? null,
    mapId: env.MAP_ID !== undefined && env.MAP_ID !== "" ? env.MAP_ID : null,
  };
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
    map: mapConfig(env),
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

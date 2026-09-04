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
  crypto: { ids: string[]; vsCurrency: string };
  bins: { provider: string; rules: BinRule[] };
}

const COMMUTE_HOME = {
  lat: 51.53578437178105,
  lon: 0.19729711541201045,
} as const;

const COMMUTE_WORK = {
  lat: 51.505184346371664,
  lon: 0.05209853605892316,
} as const;

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

function listOrDefault(raw: string | undefined, fallback: string[]): string[] {
  const values = list(raw);
  return values.length > 0 ? values : fallback;
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
      home: { lat: COMMUTE_HOME.lat, lon: COMMUTE_HOME.lon },
      homeLabel: env.COMMUTE_HOME_LABEL || "Home",
      work: { lat: COMMUTE_WORK.lat, lon: COMMUTE_WORK.lon },
      workLabel: env.COMMUTE_LABEL || "Work",
      morningStartMinutes:
        parseHhMm(env.COMMUTE_MORNING_WINDOW_START || "") ??
        parseHhMm(env.COMMUTE_WINDOW_START || "") ??
        5 * 60 + 30,
      morningEndMinutes:
        parseHhMm(env.COMMUTE_MORNING_WINDOW_END || "") ??
        parseHhMm(env.COMMUTE_WINDOW_END || "") ??
        9 * 60,
      afternoonStartMinutes: parseHhMm(env.COMMUTE_AFTERNOON_WINDOW_START || "") ?? 15 * 60,
      afternoonEndMinutes: parseHhMm(env.COMMUTE_AFTERNOON_WINDOW_END || "") ?? 19 * 60,
      days: list(env.COMMUTE_DAYS).map(Number).filter(Number.isInteger),
    },
    tfl: {
      roadIds: listOrDefault(env.TFL_ROAD_IDS, ["a12", "a13", "a406", "m25"]),
      lineModes: listOrDefault(env.TFL_LINE_MODES, ["tube"]),
    },
    crypto: {
      ids: list(env.CRYPTO_IDS),
      vsCurrency: (env.CRYPTO_VS || "gbp").toLowerCase(),
    },
    bins: {
      provider: env.BIN_PROVIDER || "havering",
      rules: parseBinRules(env.BIN_SCHEDULE),
    },
  };
}

import { SOURCE_KEYS, type SourceKey } from "../shared/types.ts";
import type { Config } from "./config.ts";
import type { Env } from "./env.ts";
import { envelopeAgeSeconds, readEnvelope, writeEnvelope, type Envelope } from "./kv.ts";
import { fetchBins } from "./sources/bins/index.ts";
import { activeCommuteSlot, fetchCommute, typicalCommuteForSlot } from "./sources/commute.ts";
import { fetchCrypto } from "./sources/crypto.ts";
import { fetchTfl } from "./sources/tfl.ts";
import { fetchWeather } from "./sources/weather.ts";
import { zonedNow } from "./time.ts";

interface Cadence {
  /** How often the cron should refresh this source. */
  refreshSeconds: number;
  /** Age at which the client marks the tile stale. Deliberately longer than
   *  the refresh interval, so a single missed cycle is not flagged as trouble. */
  ttlSeconds: number;
}

export const CADENCE: Record<SourceKey, Cadence> = {
  // Forecasts do not move quickly, and Open-Meteo is free but not ours to abuse.
  weather: { refreshSeconds: 900, ttlSeconds: 2_400 },
  // Only ever called inside active commute windows.
  commute: { refreshSeconds: 300, ttlSeconds: 600 },
  tfl: { refreshSeconds: 300, ttlSeconds: 1_200 },
  bins: { refreshSeconds: 302_400, ttlSeconds: 1_209_600 },
  crypto: { refreshSeconds: 300, ttlSeconds: 1_200 },
};

/**
 * Never retry a failed source more often than this, whatever its cadence says.
 * Five minutes is the shortest cadence any source has, so this only ever slows
 * a retry down -- it cannot make one more frequent than intended.
 */
const FAILURE_RETRY_SECONDS = 300;

/** Fetches one source's data. Throws on failure; the caller decides what that
 *  means for what is already cached. */
export async function fetchSource(
  key: SourceKey,
  config: Config,
  env: Env,
  now: Date,
): Promise<unknown> {
  switch (key) {
    case "weather":
      return await fetchWeather(config);

    case "commute": {
      const slot = activeCommuteSlot(config, now);
      if (slot === null) {
        // Outside commute windows this tile is intentionally hidden, and no
        // routing call should be made.
        return null;
      }

      const apiKey = env.GOOGLE_ROUTES_API_KEY;
      // Inside an active window, no key or upstream failure degrades to a
      // clearly labelled typical value rather than a dead tile.
      if (apiKey === undefined || apiKey === "") {
        return typicalCommuteForSlot(config, slot);
      }

      try {
        return await fetchCommute(config, apiKey, slot);
      } catch {
        return typicalCommuteForSlot(config, slot);
      }
    }

    case "tfl":
      return await fetchTfl(config);

    case "bins":
      return await fetchBins(config, env, zonedNow(now, config.timezone).date);

    case "crypto":
      return await fetchCrypto(config, env.COINGECKO_API_KEY);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

/**
 * Refreshes one source and writes the result to KV.
 *
 * On failure the previous value is kept and stamped with the error, so the
 * tile shows old data behind a staleness marker instead of going blank. That
 * is the whole reason the envelope keeps `data` and `lastError` separately.
 */
async function refreshOne(
  key: SourceKey,
  config: Config,
  env: Env,
  now: Date,
  force: boolean,
): Promise<void> {
  const existing = await readEnvelope<unknown>(env.BOARD_KV, key);
  const age = envelopeAgeSeconds(existing, now);
  const { refreshSeconds } = CADENCE[key];

  if (!force) {
    if (age !== null && age < refreshSeconds) return;

    // Back off from the last failure whether or not there is stale data to
    // fall back on.
    //
    // This check used to be gated on `age === null`. A source holding a cached
    // value but with a failing upstream therefore skipped it entirely, and
    // refetched on every cron tick *and* every board request -- and
    // assembleBoard's overdue safety net means the TV's once-a-minute poll is
    // a request. Against a 429 that is self-sustaining: the retries are what
    // keep the rate limit tripped, so the source can never recover on its own.
    //
    // Bounded by FAILURE_RETRY_SECONDS as well as the cadence, so a long-cycle
    // source like bins still recovers in minutes rather than sulking for its
    // full 3.5 days after one bad fetch.
    if (existing?.lastErrorAt !== undefined) {
      const sinceFailure =
        (now.getTime() - new Date(existing.lastErrorAt).getTime()) / 1000;
      if (sinceFailure < Math.min(refreshSeconds, FAILURE_RETRY_SECONDS)) return;
    }
  }

  try {
    const data = await fetchSource(key, config, env, now);
    await writeEnvelope(env.BOARD_KV, key, {
      data,
      fetchedAt: now.toISOString(),
    });
  } catch (error) {
    const failed: Envelope<unknown> = {
      data: existing?.data ?? null,
      fetchedAt: existing?.fetchedAt ?? null,
      lastError: messageOf(error),
      lastErrorAt: now.toISOString(),
    };
    await writeEnvelope(env.BOARD_KV, key, failed);
  }
}

/**
 * Cron entry point. Every source is independent -- one upstream hanging or
 * throwing must not stop the others being refreshed on the same tick.
 */
export async function refreshDue(
  config: Config,
  env: Env,
  now: Date,
  keys: readonly SourceKey[] = SOURCE_KEYS,
  force = false,
): Promise<void> {
  await Promise.allSettled(
    keys.map((key) => refreshOne(key, config, env, now, force)),
  );
}

import { SOURCE_KEYS, type SourceKey } from "../shared/types.ts";
import type { Config } from "./config.ts";
import type { Env } from "./env.ts";
import { envelopeAgeSeconds, readEnvelope, writeEnvelope, type Envelope } from "./kv.ts";
import { fetchBins } from "./sources/bins/index.ts";
import { fetchCommute, isInCommuteWindow, typicalCommute } from "./sources/commute.ts";
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
  // Only ever called inside the morning window.
  commute: { refreshSeconds: 120, ttlSeconds: 600 },
  tfl: { refreshSeconds: 300, ttlSeconds: 1_200 },
  bins: { refreshSeconds: 21_600, ttlSeconds: 172_800 },
  crypto: { refreshSeconds: 300, ttlSeconds: 1_200 },
};

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
      const apiKey = env.GOOGLE_ROUTES_API_KEY;
      // Outside the window, and whenever no key is configured, the typical
      // fallback is the answer -- and it costs nothing. The tile labels it as
      // typical, so this is never passed off as a live reading.
      if (apiKey === undefined || apiKey === "" || !isInCommuteWindow(config, now)) {
        return typicalCommute(config);
      }
      return await fetchCommute(config, apiKey);
    }

    case "tfl":
      return await fetchTfl(config);

    case "bins":
      return await fetchBins(config, zonedNow(now, config.timezone).date);

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

    // A source that has never succeeded has no data age to rate-limit against,
    // so without this it would be retried on every single cron tick. That is
    // exactly the wrong behaviour against an upstream returning 429: back off
    // from the last failure instead.
    if (age === null && existing?.lastErrorAt !== undefined) {
      const sinceFailure =
        (now.getTime() - new Date(existing.lastErrorAt).getTime()) / 1000;
      if (sinceFailure < refreshSeconds) return;
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

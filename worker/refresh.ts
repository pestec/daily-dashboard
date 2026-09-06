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

/**
 * Cadences are a KV write budget as much as a freshness policy.
 *
 * The Workers KV free tier allows 1,000 writes a day for the whole account, and
 * a source refreshed every five minutes spends 288 of them on its own. Five
 * sources on the five-minute cron came to ~960 writes a day before a single
 * browser ever asked for the board -- which is why the cap was being reached on
 * days nobody looked at it. Anything below 900s here claims a quarter of the
 * daily budget, so it needs to be worth that.
 */
export const CADENCE: Record<SourceKey, Cadence> = {
  // Forecasts do not move quickly, and Open-Meteo is free but not ours to abuse.
  weather: { refreshSeconds: 900, ttlSeconds: 2_400 },
  // Only ever called inside active commute windows, so its cost is bounded by
  // the windows themselves rather than by the length of the day.
  commute: { refreshSeconds: 300, ttlSeconds: 600 },
  // Line status is nearly always identical between ticks, so the unchanged-write
  // skip below does the saving here rather than the cadence.
  tfl: { refreshSeconds: 300, ttlSeconds: 1_200 },
  bins: { refreshSeconds: 302_400, ttlSeconds: 1_209_600 },
  // Prices genuinely differ on every fetch, so nothing dedupes them and the
  // cadence is the only lever. Fifteen minutes is ample for a wall board; at
  // five it was taking a third of the entire daily write budget on its own.
  crypto: { refreshSeconds: 900, ttlSeconds: 2_400 },
};

/**
 * Never retry a failed source more often than this, whatever its cadence says.
 * Five minutes is the shortest cadence any source has, so this only ever slows
 * a retry down -- it cannot make one more frequent than intended.
 */
const FAILURE_RETRY_SECONDS = 300;

/**
 * How stale an *unchanged* envelope may get before its stamp is rewritten anyway.
 *
 * Re-storing bytes identical to what is already cached tells the board nothing,
 * but skipping the write also freezes `fetchedAt`, and the client reads that to
 * decide whether a tile is stale. So the stamp is still refreshed one cadence
 * before the envelope would cross its TTL: an unchanged source never gets
 * flagged as a missed cycle, and it costs one write per TTL instead of one per
 * tick.
 */
function stampRefreshSeconds(key: SourceKey): number {
  const { refreshSeconds, ttlSeconds } = CADENCE[key];
  return Math.max(ttlSeconds - refreshSeconds, refreshSeconds);
}

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
 * Whether storing `data` would change anything the board shows.
 *
 * Both sides are produced by the same construction code, so key order is stable
 * and comparing serialised forms is enough. An envelope carrying an error never
 * counts as matching: clearing that error is a real change.
 */
function isUnchanged(existing: Envelope<unknown> | null, data: unknown): boolean {
  if (existing === null) return false;
  if (existing.lastError !== undefined) return false;
  if (existing.fetchedAt === null) return false;
  return JSON.stringify(existing.data) === JSON.stringify(data);
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

    // Nothing to cache -- commute outside its window is the only source that
    // reaches this. The board works out on its own that the tile is disabled
    // and never reads the envelope, so persisting a null over a null bought
    // nothing while costing a write on every tick of every hour the commute was
    // not running: close to a third of the daily budget, most of it overnight.
    if (data === null) return;

    if (isUnchanged(existing, data)) {
      const stampAge = envelopeAgeSeconds(existing, now);
      if (stampAge !== null && stampAge < stampRefreshSeconds(key)) return;
    }

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
    // Deliberately written every time, even when the same error repeats: the
    // retry backoff above reads `lastErrorAt` back out of KV, so freezing that
    // stamp to save a write would disable the backoff and let every board poll
    // hammer an upstream that is already failing.
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

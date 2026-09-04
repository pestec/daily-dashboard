import {
  SOURCE_KEYS,
  type BoardMode,
  type BoardPayload,
  type Bins,
  type Commute,
  type Crypto,
  type Source,
  type SourceKey,
  type Tfl,
  type Weather,
} from "../shared/types.ts";
import type { Config } from "./config.ts";
import type { Env } from "./env.ts";
import { readEnvelope, toSource, writeEnvelope, type Envelope } from "./kv.ts";
import { CADENCE, fetchSource } from "./refresh.ts";
import { isInCommuteWindow } from "./sources/commute.ts";

/**
 * Reads one source out of KV.
 *
 * Normally this touches nothing but the cache. The exception is a source that
 * has never been written -- a fresh deploy, before the first cron tick -- where
 * it is fetched inline so the very first load shows a real board rather than
 * six dead tiles for up to two minutes.
 */
async function loadSource(
  key: SourceKey,
  config: Config,
  env: Env,
  now: Date,
  ctx: ExecutionContext,
): Promise<Envelope<unknown> | null> {
  const cached = await readEnvelope<unknown>(env.BOARD_KV, key);
  if (cached !== null) return cached;

  try {
    const data = await fetchSource(key, config, env, now);
    const envelope: Envelope<unknown> = { data, fetchedAt: now.toISOString() };
    // The response does not need to wait on the write.
    ctx.waitUntil(writeEnvelope(env.BOARD_KV, key, envelope));
    return envelope;
  } catch (error) {
    return {
      data: null,
      fetchedAt: null,
      lastError: error instanceof Error ? error.message : "Unknown error",
      lastErrorAt: now.toISOString(),
    };
  }
}

export function boardMode(config: Config, now: Date): BoardMode {
  return isInCommuteWindow(config, now) ? "morning" : "ambient";
}

export async function assembleBoard(
  config: Config,
  env: Env,
  now: Date,
  ctx: ExecutionContext,
): Promise<BoardPayload> {
  // One slow or missing source must not hold up the other four.
  const settled = await Promise.all(
    SOURCE_KEYS.map(async (key) => [key, await loadSource(key, config, env, now, ctx)] as const),
  );

  const envelopes = new Map(settled);
  const sourceFor = <T>(key: SourceKey): Source<T> =>
    toSource(envelopes.get(key) as Envelope<T> | null | undefined ?? null, CADENCE[key].ttlSeconds);

  return {
    generatedAt: now.toISOString(),
    meta: { timezone: config.timezone, mode: boardMode(config, now) },
    weather: sourceFor<Weather>("weather"),
    commute: sourceFor<Commute>("commute"),
    tfl: sourceFor<Tfl>("tfl"),
    bins: sourceFor<Bins>("bins"),
    crypto: sourceFor<Crypto>("crypto"),
  };
}

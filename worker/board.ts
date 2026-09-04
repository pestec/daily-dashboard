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
import {
  envelopeAgeSeconds,
  readEnvelope,
  toSource,
  writeEnvelope,
  type Envelope,
} from "./kv.ts";
import { CADENCE, fetchSource, refreshDue } from "./refresh.ts";
import { activeCommuteSlot } from "./sources/commute.ts";

const NULL_DATA_RETRY_COOLDOWN_SECONDS = 300;

function secondsSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 1000;
}

function nullDataRetryCooldownSeconds(key: SourceKey): number {
  // Bins can remain stuck for hours because its normal refresh cadence is long,
  // so it retries immediately when the cached envelope has no data.
  return key === "bins" ? 0 : NULL_DATA_RETRY_COOLDOWN_SECONDS;
}

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
  if (cached !== null) {
    if (
      cached.data === null &&
      cached.lastErrorAt !== undefined &&
      secondsSince(cached.lastErrorAt, now) >= nullDataRetryCooldownSeconds(key)
    ) {
      try {
        const data = await fetchSource(key, config, env, now);
        const envelope: Envelope<unknown> = { data, fetchedAt: now.toISOString() };
        ctx.waitUntil(writeEnvelope(env.BOARD_KV, key, envelope));
        return envelope;
      } catch {
        // Keep the previous failure envelope to avoid amplifying outages.
      }
    }

    return cached;
  }

  try {
    const data = await fetchSource(key, config, env, now);
    const envelope: Envelope<unknown> = { data, fetchedAt: now.toISOString() };
    // The response does not need to wait on the write.
    ctx.waitUntil(writeEnvelope(env.BOARD_KV, key, envelope));
    return envelope;
  } catch (error) {
    const failed: Envelope<unknown> = {
      data: null,
      fetchedAt: null,
      lastError: error instanceof Error ? error.message : "Unknown error",
      lastErrorAt: now.toISOString(),
    };
    // Persisting the failure is what stops this being retried on *every*
    // request: without a key in KV the source looks like a cold start
    // forever, and a poll every 60s turns into a fetch every 60s against an
    // upstream that is already failing.
    ctx.waitUntil(writeEnvelope(env.BOARD_KV, key, failed));
    return failed;
  }
}

/** Sources whose data is older than their own refresh cadence -- meaning the
 *  scheduled refresh did not happen when it should have. */
function overdue(
  envelopes: ReadonlyMap<SourceKey, Envelope<unknown> | null>,
  now: Date,
): SourceKey[] {
  return SOURCE_KEYS.filter((key) => {
    const envelope = envelopes.get(key) ?? null;
    if (envelope === null) return false;
    const age = envelopeAgeSeconds(envelope, now);
    // No data at all: go by how long ago it last failed.
    if (age === null) {
      if (envelope.lastErrorAt === undefined) return true;
      const since = (now.getTime() - new Date(envelope.lastErrorAt).getTime()) / 1000;
      return since >= CADENCE[key].refreshSeconds;
    }
    return age >= CADENCE[key].refreshSeconds;
  });
}

export function boardMode(config: Config, now: Date): BoardMode {
  return activeCommuteSlot(config, now) === null ? "ambient" : "morning";
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

  // Safety net. The cron owns refreshing, but a Worker can end up deployed
  // without its triggers applied -- `wrangler versions upload` does not set
  // them -- and a board that quietly serves hour-old weather forever is worse
  // than one that repairs itself. Anything past its cadence is refreshed in
  // the background, so the response stays a cache read and the next poll gets
  // fresh data.
  const stale = overdue(envelopes, now);
  if (stale.length > 0) {
    ctx.waitUntil(refreshDue(config, env, now, stale));
  }
  const sourceFor = <T>(key: SourceKey): Source<T> =>
    toSource(envelopes.get(key) as Envelope<T> | null | undefined ?? null, CADENCE[key].ttlSeconds);

  const commuteSlot = activeCommuteSlot(config, now);
  const commuteSource = commuteSlot === null
    ? {
        status: "disabled" as const,
        data: null,
        fetchedAt: null,
        ttlSeconds: CADENCE.commute.ttlSeconds,
      } satisfies Source<Commute>
    : sourceFor<Commute>("commute");

  return {
    generatedAt: now.toISOString(),
    meta: { timezone: config.timezone, mode: boardMode(config, now) },
    weather: sourceFor<Weather>("weather"),
    commute: commuteSource,
    tfl: sourceFor<Tfl>("tfl"),
    bins: sourceFor<Bins>("bins"),
    crypto: sourceFor<Crypto>("crypto"),
  };
}

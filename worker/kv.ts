import type { Source, SourceKey } from "../shared/types.ts";

/**
 * What actually lives in KV per source.
 *
 * `data` and `lastError` are independent on purpose: a source that fails after
 * having succeeded keeps its last good value and gains an error stamp, so the
 * tile can show old data behind a staleness marker instead of going blank.
 */
export interface Envelope<T> {
  data: T | null;
  /** When `data` was obtained -- not when this envelope was written. */
  fetchedAt: string | null;
  lastError?: string;
  lastErrorAt?: string;
}

const key = (source: SourceKey): string => `source:${source}`;

export async function readEnvelope<T>(
  kv: KVNamespace,
  source: SourceKey,
): Promise<Envelope<T> | null> {
  return await kv.get<Envelope<T>>(key(source), "json");
}

export async function writeEnvelope<T>(
  kv: KVNamespace,
  source: SourceKey,
  envelope: Envelope<T>,
): Promise<void> {
  await kv.put(key(source), JSON.stringify(envelope));
}

/** Age of the data in seconds, or null if there has never been any. */
export function envelopeAgeSeconds(
  envelope: Envelope<unknown> | null,
  now: Date,
): number | null {
  if (envelope?.fetchedAt == null) return null;
  return (now.getTime() - new Date(envelope.fetchedAt).getTime()) / 1000;
}

/** Projects the stored envelope into the shape the board consumes. */
export function toSource<T>(
  envelope: Envelope<T> | null,
  ttlSeconds: number,
): Source<T> {
  if (envelope === null || envelope.data === null) {
    return {
      status: "error",
      data: null,
      fetchedAt: null,
      ttlSeconds,
      ...(envelope?.lastError === undefined
        ? { error: "No data yet" }
        : { error: envelope.lastError }),
    };
  }

  // Data present but the most recent attempt failed: show it, flagged.
  if (envelope.lastError !== undefined) {
    return {
      status: "stale",
      data: envelope.data,
      fetchedAt: envelope.fetchedAt,
      ttlSeconds,
      error: envelope.lastError,
    };
  }

  return {
    status: "ok",
    data: envelope.data,
    fetchedAt: envelope.fetchedAt,
    ttlSeconds,
  };
}

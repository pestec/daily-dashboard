import type { Source } from "../../shared/types.ts";

/** A source is stale once it is older than the TTL the Worker declared for it.
 *  Takes Source<unknown> rather than a generic so it can be called over a
 *  heterogeneous list of sources, which is what the debug overlay does. */
export function isStale(source: Source<unknown>, now: number): boolean {
  if (source.status === "stale") return true;
  if (source.fetchedAt === null) return false;
  const ageSeconds = (now - new Date(source.fetchedAt).getTime()) / 1000;
  return ageSeconds > source.ttlSeconds;
}

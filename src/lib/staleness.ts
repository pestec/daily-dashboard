import type { Source } from "../../shared/types.ts";

/** A source is stale once it is older than the TTL the Worker declared for it. */
export function isStale<T>(source: Source<T>, now: number): boolean {
  if (source.status === "stale") return true;
  if (source.fetchedAt === null) return false;
  const ageSeconds = (now - new Date(source.fetchedAt).getTime()) / 1000;
  return ageSeconds > source.ttlSeconds;
}

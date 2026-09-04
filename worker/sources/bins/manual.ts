import type { BinCollection, BinKind, Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import { addDays, daysBetween } from "../../time.ts";
import type { BinProvider } from "./types.ts";

/** Next occurrence of a rule on or after `today`. */
function nextOccurrence(anchor: string, intervalDays: number, today: string): string {
  const elapsed = daysBetween(anchor, today);
  if (elapsed <= 0) return anchor;
  const cycles = Math.ceil(elapsed / intervalDays);
  return addDays(anchor, cycles * intervalDays);
}

/**
 * The dependable provider: a recurring schedule read straight from config.
 *
 * Council endpoints are unreliable and change without notice, so this is the
 * default rather than a fallback of last resort. Two fortnightly rules offset
 * by a week express the usual alternating-collection pattern.
 */
export const manualProvider: BinProvider = {
  name: "manual",

  fetch(config: Config, today: string): Promise<Bins> {
    const { rules } = config.bins;

    // Two occurrences per rule is enough to fill "next" and "following" even
    // when a single rule is the only one configured.
    const dated = new Map<string, Set<BinKind>>();
    for (const rule of rules) {
      let date = nextOccurrence(rule.anchor, rule.intervalDays, today);
      for (let i = 0; i < 2; i += 1) {
        const kinds = dated.get(date) ?? new Set<BinKind>();
        for (const kind of rule.kinds) kinds.add(kind);
        dated.set(date, kinds);
        date = addDays(date, rule.intervalDays);
      }
    }

    const collections: BinCollection[] = [...dated.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kinds]) => ({ date, kinds: [...kinds] }));

    return Promise.resolve({
      provider: manualProvider.name,
      next: collections[0] ?? null,
      following: collections[1] ?? null,
    });
  },
};

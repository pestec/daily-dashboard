import type { Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import type { Env } from "../../env.ts";
import { fetchHaveringDebug, haveringProvider } from "./havering.ts";
import { manualProvider } from "./manual.ts";
import { type BinProvider } from "./types.ts";

export type { BinProvider } from "./types.ts";

const PROVIDERS: readonly BinProvider[] = [manualProvider, haveringProvider];

/**
 * Runs the configured provider, falling back to the manual schedule if it is
 * unavailable. The result records which provider actually answered, so the
 * tile is never quietly showing fallback data while claiming otherwise.
 */
export async function fetchBins(config: Config, env: Env, today: string): Promise<Bins> {
  const selected =
    PROVIDERS.find((provider) => provider.name === config.bins.provider) ??
    manualProvider;

  if (selected !== manualProvider) {
    try {
      const result = await selected.fetch(config, env, today);
      if (result.next !== null || result.following !== null) {
        return result;
      }
      // Browser HTML can be JS-hydrated with no server-rendered rows.
      // When that happens, fall back to configured recurring schedule.
      return await manualProvider.fetch(config, env, today);
    } catch {
      // Fall through to the schedule that does not depend on a council site.
    }
  }

  return await manualProvider.fetch(config, env, today);
}

export async function fetchBinsDebug(config: Config, env: Env, today: string): Promise<unknown> {
  if (config.bins.provider === haveringProvider.name) {
    return await fetchHaveringDebug(today, env);
  }

  return {
    provider: manualProvider.name,
    parsed: await manualProvider.fetch(config, env, today),
    raw: null,
  };
}

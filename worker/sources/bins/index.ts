import type { Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import { haveringProvider } from "./havering.ts";
import { manualProvider } from "./manual.ts";
import type { BinProvider } from "./types.ts";

export { ProviderUnavailableError } from "./types.ts";
export type { BinProvider } from "./types.ts";

const PROVIDERS: readonly BinProvider[] = [manualProvider, haveringProvider];

/**
 * Runs the configured provider, falling back to the manual schedule if it is
 * unavailable. The result records which provider actually answered, so the
 * tile is never quietly showing fallback data while claiming otherwise.
 */
export async function fetchBins(config: Config, today: string): Promise<Bins> {
  const selected =
    PROVIDERS.find((provider) => provider.name === config.bins.provider) ??
    manualProvider;

  if (selected !== manualProvider) {
    try {
      return await selected.fetch(config, today);
    } catch {
      // Fall through to the schedule that does not depend on a council site.
    }
  }

  return await manualProvider.fetch(config, today);
}

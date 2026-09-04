import type { Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import { type BinProvider, ProviderUnavailableError } from "./types.ts";

/**
 * Placeholder for a real Havering lookup.
 *
 * Deliberately not implemented. Havering has no documented public API for
 * collection dates, so anything here would be scraping a page that changes
 * without warning -- exactly the kind of thing that breaks quietly on a screen
 * nobody is watching. Selecting this provider falls back to the manual
 * schedule, which is the one that actually stays correct.
 *
 * To implement: resolve a UPRN for the address, call whatever endpoint the
 * council's collection-day page uses, and map its rounds onto BinKind.
 */
export const haveringProvider: BinProvider = {
  name: "havering",

  fetch(_config: Config, _today: string): Promise<Bins> {
    return Promise.reject(
      new ProviderUnavailableError("Havering lookup not implemented"),
    );
  },
};

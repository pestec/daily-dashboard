import type { Bins } from "../../../shared/types.ts";
import type { Config } from "../../config.ts";
import type { Env } from "../../env.ts";

/** Thrown by a provider that exists but cannot serve a result, so the registry
 *  can fall back rather than surfacing the tile as broken. */
export class ProviderUnavailableError extends Error {}

export interface BinProvider {
  readonly name: string;
  /** `today` is a YYYY-MM-DD in the configured timezone, not the Worker's. */
  fetch(config: Config, env: Env, today: string): Promise<Bins>;
}

/**
 * `wrangler types` types every `vars` entry as the string *literal* it holds in
 * wrangler.jsonc, so `env.MOCK === "true"` would be a compile error against the
 * placeholder "false". Widen those back to string while keeping the real
 * binding types (KVNamespace, Fetcher) intact.
 *
 * Regenerate with `npm run cf-typegen` after editing wrangler.jsonc.
 */
type Vars = {
  [K in keyof Cloudflare.Env]: Cloudflare.Env[K] extends string
    ? string
    : Cloudflare.Env[K];
};

/**
 * Secrets, set with `wrangler secret put` (or in the dashboard) and never in
 * the repo. Declared here rather than picked up from a local .dev.vars, so a
 * clean checkout typechecks without one.
 *
 * Both are optional and the board degrades rather than breaking: with no
 * Google Routes key the commute tile stays on the typical fallback, and CoinGecko's
 * free tier serves us without a key at a tighter rate limit.
 */
interface Secrets {
  GOOGLE_ROUTES_API_KEY?: string;
  COINGECKO_API_KEY?: string;
}

/**
 * Vars that live only in the Cloudflare dashboard, never in wrangler.jsonc.
 *
 * They are kept out of `vars` on purpose: `keep_vars` only stops wrangler
 * deleting dashboard vars this repo does not name, and every key it *does*
 * name is re-uploaded on each deploy -- so a placeholder in wrangler.jsonc
 * would reset the real value on every push. Because nothing declares them at
 * build time, `wrangler types` cannot see them and they are typed here as
 * optional instead; `readConfig` treats an absent one as unset and falls back.
 */
interface DashboardVars {
  WEATHER_LAT?: string;
  WEATHER_LON?: string;
  HOME_LAT?: string;
  HOME_LON?: string;
  WORK_LAT?: string;
  WORK_LON?: string;
  BIN_SCHEDULE?: string;
}

interface OptionalBindings {
  BROWSER?: Fetcher;
}

export type Env = Vars & DashboardVars & Secrets & OptionalBindings;

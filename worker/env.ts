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
 * TomTom key the commute tile shows the configured baseline, and CoinGecko's
 * free tier serves us without a key at a tighter rate limit.
 */
interface Secrets {
  TOMTOM_API_KEY?: string;
  COINGECKO_API_KEY?: string;
}

export type Env = Vars & Secrets;

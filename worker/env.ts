/**
 * `wrangler types` types every `vars` entry as the string *literal* it holds in
 * wrangler.jsonc, so `env.MOCK === "true"` would be a compile error against the
 * placeholder "false". Widen those back to string while keeping the real
 * binding types (KVNamespace, Fetcher) intact.
 *
 * Regenerate with `npm run cf-typegen` after editing wrangler.jsonc.
 */
export type Env = {
  [K in keyof Cloudflare.Env]: Cloudflare.Env[K] extends string
    ? string
    : Cloudflare.Env[K];
};

import type { Crypto, CryptoTicker } from "../../shared/types.ts";
import type { Config } from "../config.ts";
import { fetchJson, UpstreamError } from "../http.ts";

/** /coins/markets rather than /simple/price: it returns the ticker symbol in
 *  the same call, so there is no hardcoded id-to-symbol table to keep correct. */
interface CoinGeckoMarket {
  id?: string;
  symbol?: string;
  current_price?: number;
  price_change_percentage_24h?: number;
  /** Only returned when the window is named in `price_change_percentage`, and
   *  suffixed with the vs_currency rather than being a plain percentage. */
  price_change_percentage_7d_in_currency?: number;
}

export async function fetchCrypto(
  config: Config,
  apiKey: string | undefined,
): Promise<Crypto> {
  const { ids, vsCurrency } = config.crypto;
  if (ids.length === 0) {
    return { vsCurrency, tickers: [] };
  }

  const url =
    "https://api.coingecko.com/api/v3/coins/markets" +
    `?vs_currency=${encodeURIComponent(vsCurrency)}` +
    `&ids=${ids.map(encodeURIComponent).join(",")}` +
    "&price_change_percentage=24h,7d&sparkline=false";

  const hasKey = apiKey !== undefined && apiKey !== "";

  const body = await fetchJson<CoinGeckoMarket[]>(url, {
    label: "CoinGecko",
    // Once a key is configured, "an API key would fix this" is no longer true
    // and sends whoever reads the debug overlay looking for the wrong thing.
    rateLimitHint: hasKey
      ? "key is set, so this is the key's own quota"
      : "set COINGECKO_API_KEY",
    headers: {
      accept: "application/json",
      // CoinGecko rejects requests with no User-Agent outright -- a Worker
      // sends none by default, so the same URL that works from curl 403s here.
      "user-agent": "daily-dashboard (Cloudflare Worker)",
      // A Demo key -- the free one -- is what this pairs with, on
      // api.coingecko.com. A paid Pro key is a different host
      // (pro-api.coingecko.com) and a different header (x-cg-pro-api-key),
      // and sending it here returns 400 rather than working at a better rate.
      ...(apiKey !== undefined && apiKey !== ""
        ? { "x-cg-demo-api-key": apiKey }
        : {}),
    },
  });

  if (!Array.isArray(body)) {
    throw new UpstreamError("CoinGecko returned an unexpected shape");
  }

  const byId = new Map(body.map((entry) => [entry.id, entry]));

  // Config order, not response order -- the strip should not reshuffle itself
  // between refreshes on a screen someone glances at.
  const tickers: CryptoTicker[] = ids.flatMap((id) => {
    const entry = byId.get(id);
    if (entry?.current_price === undefined) return [];
    return [
      {
        id,
        symbol: (entry.symbol ?? id).toUpperCase(),
        price: entry.current_price,
        change24hPct: entry.price_change_percentage_24h ?? 0,
        change7dPct: entry.price_change_percentage_7d_in_currency ?? null,
      },
    ];
  });

  if (tickers.length === 0) {
    throw new UpstreamError("CoinGecko returned no matching coins");
  }

  return { vsCurrency, tickers };
}

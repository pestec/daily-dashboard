import { isMockVariant, mockBoard } from "../shared/fixtures.ts";
import { assembleBoard } from "./board.ts";
import { readConfig } from "./config.ts";
import type { Env } from "./env.ts";
import { refreshDue } from "./refresh.ts";
import { fetchBinsDebug } from "./sources/bins/index.ts";
import { fetchCrypto } from "./sources/crypto.ts";
import { activeCommuteSlot, fetchCommuteDebug } from "./sources/commute.ts";
import { zonedNow } from "./time.ts";

const JSON_HEADERS = {
  // The board is a live view; nothing between here and the TV should hold on
  // to it. Freshness is decided server-side, per source.
  "cache-control": "no-store",
} as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/debug/commute-live") {
      const apiKey = env.GOOGLE_ROUTES_API_KEY;
      if (apiKey === undefined || apiKey === "") {
        return Response.json(
          { error: "GOOGLE_ROUTES_API_KEY is not configured" },
          { status: 400, headers: JSON_HEADERS },
        );
      }

      const config = readConfig(env);
      try {
        const slot = activeCommuteSlot(config, new Date()) ?? "morning";
        const payload = await fetchCommuteDebug(config, apiKey, slot);
        return Response.json(payload, { headers: JSON_HEADERS });
      } catch (error) {
        console.error("commute debug failed", error);
        return Response.json(
          { error: error instanceof Error ? error.message : "Commute debug unavailable" },
          { status: 502, headers: JSON_HEADERS },
        );
      }
    }

    if (url.pathname === "/api/debug/bins-live") {
      const config = readConfig(env);
      try {
        const today = zonedNow(new Date(), config.timezone).date;
        const payload = await fetchBinsDebug(config, env, today);
        return Response.json(payload, { headers: JSON_HEADERS });
      } catch (error) {
        console.error("bins debug failed", error);
        return Response.json(
          { error: error instanceof Error ? error.message : "Bins debug unavailable" },
          { status: 502, headers: JSON_HEADERS },
        );
      }
    }

    /* The crypto tile reads a cached envelope like every other tile, so when it
       shows the wrong coins there are two candidates and no way to tell them
       apart from the board: the configuration the Worker actually resolved,
       and whether CoinGecko is answering at all. A failed refresh deliberately
       keeps the last good value, so stale data and a broken upstream look
       identical on screen. This returns both, live, bypassing KV. */
    if (url.pathname === "/api/debug/crypto-live") {
      const config = readConfig(env);
      const resolved = {
        ids: config.crypto.ids,
        vsCurrency: config.crypto.vsCurrency,
        apiKeyConfigured:
          env.COINGECKO_API_KEY !== undefined && env.COINGECKO_API_KEY !== "",
      };
      try {
        const data = await fetchCrypto(config, env.COINGECKO_API_KEY);
        return Response.json(
          { resolved, returned: data.tickers.length, data },
          { headers: JSON_HEADERS },
        );
      } catch (error) {
        console.error("crypto debug failed", error);
        return Response.json(
          {
            resolved,
            error: error instanceof Error ? error.message : "Crypto unavailable",
          },
          { status: 502, headers: JSON_HEADERS },
        );
      }
    }

    if (url.pathname !== "/api/board") {
      return new Response("Not found", { status: 404 });
    }

    // Fixtures are reachable by query param even in production, so every
    // layout state -- including the broken ones -- can be reviewed on the
    // deployed board from a phone. They contain no real data and no secrets.
    const requested = url.searchParams.get("mock");
    if (isMockVariant(requested)) {
      return Response.json(mockBoard(requested), { headers: JSON_HEADERS });
    }
    if (env.MOCK === "true") {
      return Response.json(mockBoard("ambient"), { headers: JSON_HEADERS });
    }

    const config = readConfig(env);

    try {
      const payload = await assembleBoard(config, env, new Date(), ctx);
      return Response.json(payload, { headers: JSON_HEADERS });
    } catch (error) {
      // Reaching here means something structural failed rather than a single
      // source -- the client keeps its previous payload and retries with
      // backoff, so this stays a 503 rather than an empty 200.
      console.error("assembleBoard failed", error);
      return Response.json(
        { error: "Board unavailable" },
        { status: 503, headers: JSON_HEADERS },
      );
    }
  },

  /**
    * Fires every 5 minutes. The handler decides per source whether a refresh is
   * actually due, which is what keeps the commute inside its morning window
   * and everything else inside its own cadence.
   */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (env.MOCK === "true") return;
    const config = readConfig(env);
    ctx.waitUntil(refreshDue(config, env, new Date()));
  },
} satisfies ExportedHandler<Env>;

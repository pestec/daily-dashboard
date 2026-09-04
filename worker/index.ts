import { isMockVariant, mockBoard } from "../shared/fixtures.ts";
import { assembleBoard } from "./board.ts";
import { readConfig } from "./config.ts";
import type { Env } from "./env.ts";
import { refreshDue } from "./refresh.ts";

const JSON_HEADERS = {
  // The board is a live view; nothing between here and the TV should hold on
  // to it. Freshness is decided server-side, per source.
  "cache-control": "no-store",
} as const;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
   * Fires every 2 minutes. The handler decides per source whether a refresh is
   * actually due, which is what keeps the commute inside its morning window
   * and everything else inside its own cadence.
   */
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (env.MOCK === "true") return;
    const config = readConfig(env);
    ctx.waitUntil(refreshDue(config, env, new Date()));
  },
} satisfies ExportedHandler<Env>;

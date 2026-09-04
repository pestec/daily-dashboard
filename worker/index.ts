import { mockBoard } from "../shared/fixtures.ts";
import type { Env } from "./env.ts";

const JSON_HEADERS = {
  // The board is a live view; nothing between here and the TV should hold on
  // to it. Freshness is decided server-side, per source.
  "cache-control": "no-store",
} as const;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/board") {
      // Real sources land next. Until then the Worker serves the same
      // fixtures the client uses, so a deployed preview shows a real board
      // rather than six tiles stuck on "Loading".
      if (env.MOCK === "true") {
        return Response.json(mockBoard("ambient"), { headers: JSON_HEADERS });
      }
      return Response.json(
        { error: "No sources configured" },
        { status: 503, headers: JSON_HEADERS },
      );
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

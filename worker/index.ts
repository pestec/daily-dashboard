import type { Env } from "./env.ts";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/board") {
      return Response.json(
        { generatedAt: new Date().toISOString() },
        { headers: { "cache-control": "no-store" } },
      );
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

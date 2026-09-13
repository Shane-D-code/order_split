import type { Env } from "./env";
import { handleApi } from "./relay";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if ((request.method === "GET" || request.method === "HEAD") && request.url.endsWith("/health")) {
      return new Response("ok", { status: 200 });
    }
    try {
      return await handleApi(request, env);
    } catch (err) {
      console.error("relay error", err);
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },

  /** Opportunistic compaction of expired keys; errors are non-fatal. */
  async scheduled(_controller: unknown): Promise<void> {
    // KV handles TTL expiry itself; nothing to do here today.
  },
};
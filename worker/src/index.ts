import type { Env } from "./env";
import { handleApi } from "./relay";

/**
 * Browser CORS policy. The relay is a bearer-token encrypted mailbox with
 * no cookies, so a permissive origin is safe; applied once at the fetch
 * boundary so every route inherits it.
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Token",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight: answered before any route, auth or body parsing.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if ((request.method === "GET" || request.method === "HEAD") && request.url.endsWith("/health")) {
      return withCors(new Response("ok", { status: 200 }));
    }
    try {
      return withCors(await handleApi(request, env));
    } catch (err) {
      console.error("relay error", err);
      return withCors(
        new Response(JSON.stringify({ error: "Internal error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
  },

  /** Opportunistic compaction of expired keys; errors are non-fatal. */
  async scheduled(_controller: unknown): Promise<void> {
    // KV handles TTL expiry itself; nothing to do here today.
  },
};
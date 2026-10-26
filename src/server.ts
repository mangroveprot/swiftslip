import "./server/errors/capture";

import { consumeLastCapturedError } from "./server/errors/capture";
import { renderErrorPage } from "./server/errors/page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

/** Every response gets these; CSP is added in production only (see below). */
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

/**
 * Production CSP. Vite's dev server needs inline scripts and a websocket for
 * HMR, so the policy is only attached to built output.
 *
 * `'unsafe-inline'` is required by TanStack Start's hydration bootstrap and by
 * the inline styles the UI renders. It is a known weakening: the rest of the
 * policy still blocks external scripts, framing, `<base>` hijacking, plugins
 * and form posts to other origins.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co",
  "worker-src 'self' blob:",
].join("; ");

/**
 * Upper bound for any request body. The largest legitimate payload is a 10 MB
 * attachment, which expands to ~13.4 MB as base64 — 16 MB leaves headroom for
 * the JSON around it while refusing anything that would be buffered in memory
 * before Zod can reject it.
 */
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;

function requestTooLarge(request: Request): boolean {
  const length = request.headers.get("content-length");
  if (!length) return false;
  const bytes = Number(length);
  return Number.isFinite(bytes) && bytes > MAX_REQUEST_BYTES;
}

function applySecurityHeaders(response: Response): Response {
  try {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(name)) response.headers.set(name, value);
    }
    if (import.meta.env.PROD && !response.headers.has("Content-Security-Policy")) {
      response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    return response;
  } catch {
    // A response whose headers are immutable: rebuild it around the same body.
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
    if (import.meta.env.PROD) headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    if (requestTooLarge(request)) {
      return applySecurityHeaders(
        new Response("Request body too large.", {
          status: 413,
          headers: { "content-type": "text/plain; charset=utf-8" },
        }),
      );
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return applySecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return applySecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};

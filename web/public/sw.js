/*
 * SwiftSlip service worker.
 *
 * It exists to make the app installable (Chromium only offers the install
 * prompt to a page with a manifest *and* a service worker that handles
 * `fetch`) and to keep the shell usable when the connection drops. API calls
 * are deliberately never cached — they are user data, and a stale document
 * list is worse than an honest offline error.
 *
 * Caching strategy:
 *   - Navigations: network first, falling back to the cached app shell, so a
 *     signed-in screen still opens offline and a deploy is picked up at once.
 *   - Hashed build assets / icons / fonts: stale-while-revalidate. Vite puts a
 *     content hash in every `/assets/*` name, so serving yesterday's file
 *     while downloading the new one is safe.
 *
 * Bump VERSION when the precache list or the strategy changes; `activate`
 * deletes every older `swiftslip-*` cache.
 */
const VERSION = "v1";
const SHELL_CACHE = `swiftslip-shell-${VERSION}`;
const ASSET_CACHE = `swiftslip-assets-${VERSION}`;

/** The minimum needed to paint the app offline. Missing entries never abort install. */
const SHELL = [
  "/",
  "/manifest.webmanifest",
  "/theme-init.js",
  "/favicon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/apple-touch-icon.png",
];

/** Requests that must always go to the network: user data, auth, live updates. */
function isApiRequest(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // `addAll` rejects the whole install if one file 404s. Each entry is
      // precached on its own so a renamed icon can never block the update.
      await Promise.allSettled(
        SHELL.map((path) => cache.add(new Request(path, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("swiftslip-") && !keep.has(key))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Network first, then the cached shell. A slow/offline network falls back immediately. */
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic") {
      const cache = await caches.open(SHELL_CACHE);
      // Every client-side route is served the same index.html by the API's
      // SPA fallback, so one copy under a stable key covers all of them.
      await cache.put("/index.html", response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = (await cache.match("/index.html")) || (await cache.match("/"));
    if (cached) return cached;
    return new Response("SwiftSlip is offline. Reconnect and try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

/** Serve the cached copy at once, refresh it in the background. */
async function handleAsset(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // Only cache complete same-origin responses; range/opaque ones cannot be reused.
      if (response.ok && response.type === "basic") {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  return (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Vite's fingerprinted bundle, plus anything the browser would otherwise
  // re-download for a screen the person already opened.
  const cacheable =
    url.pathname.startsWith("/assets/") ||
    ["script", "style", "image", "font"].includes(request.destination);
  if (cacheable) event.respondWith(handleAsset(request));
});

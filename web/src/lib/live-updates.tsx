/**
 * Live updates over ONE Server-Sent Events stream per signed-in tab.
 *
 * The server pushes only `{ v: number }` — "something in the database changed".
 * On that hint we invalidate every query that is actually on screen, so an HR
 * reviewer sees an employee's submitted form without pressing refresh, and the
 * employee sees HR's approval / sign-off without pressing refresh. A quiet
 * database sends no events and causes no refetches at all.
 *
 * Why this is cheap on Supabase's free tier:
 *  - no polling per screen and no polling per tab;
 *  - one shared, head-only signal probe every 60 s on the server (zero response
 *    body — just a Content-Range header), and none at all when no tab is open;
 *  - invalidateQueries with `refetchType: "active"` refetches only mounted
 *    queries. Exploding activity (submit writes an audit row + notifications)
 *    is coalesced by the debounce + version-gate below.
 *
 * `EventSource` relies on the session cookie. That works for the same-site
 * deployment (one container serves web + API) and for a subdomain API; a fully
 * cross-site API would need `SameSite=None; Secure` on the cookie.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { useSession } from "@/features/auth/use-session";
import { apiStreamUrl } from "@/lib/api-client";

/** Coalesce a burst of events into one refetch wave. */
const DEBOUNCE_MS = 300;
/** Hard floor: never fire more than one refetch wave per this window. */
const MIN_REFRESH_MS = 5_000;
/** Dropped stream: 2s, 4s, 8s … capped at 60s, instead of hammering the API. */
const INITIAL_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;
/** Coming back to a tab only pays for a refetch if it was away a while. */
const MIN_AWAY_MS = 30_000;

/** Auth + expensive previews must not be churned by a generic change hint. */
const SKIP = new Set(["session", "user-photos", "storage-orphans-preview"]);
/** Signed attachment URLs already refresh on their own TTL timers. */
const SKIP_SUFFIXES = ["-attachment", "-other-urls"];

export function LiveUpdates() {
  const qc = useQueryClient();
  const session = useSession();
  const signedIn = Boolean(session);

  useEffect(() => {
    if (!signedIn || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let retryTimer: number | undefined;
    let debounceTimer: number | undefined;
    let attempts = 0;
    let openedBefore = false;
    let hiddenAt = 0;
    // Version-gate: skip duplicate or out-of-order signals. The server
    // increments a monotonic counter per push; we only invalidate when it
    // actually goes UP.
    let lastVersion = -1;
    // Throttle floor: timestamp of the last refetch wave.
    let lastRefreshAt = 0;

    const refresh = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        const now = Date.now();
        const elapsed = now - lastRefreshAt;
        if (elapsed < MIN_REFRESH_MS) {
          // Reschedule for the remainder of the throttle window so we don't
          // drop the signal — just delay it.
          debounceTimer = window.setTimeout(() => {
            lastRefreshAt = Date.now();
            void qc.invalidateQueries({
              refetchType: "active",
              predicate: (query) => {
                const head = query.queryKey[0];
                if (typeof head !== "string" || SKIP.has(head)) return false;
                return !SKIP_SUFFIXES.some((suffix) => head.endsWith(suffix));
              },
            });
          }, MIN_REFRESH_MS - elapsed);
          return;
        }
        lastRefreshAt = now;
        void qc.invalidateQueries({
          refetchType: "active",
          predicate: (query) => {
            const head = query.queryKey[0];
            if (typeof head !== "string" || SKIP.has(head)) return false;
            return !SKIP_SUFFIXES.some((suffix) => head.endsWith(suffix));
          },
        });
      }, DEBOUNCE_MS);
    };

    const connect = () => {
      source = new EventSource(apiStreamUrl("/updates/stream"), {
        withCredentials: true,
      });
      source.onopen = () => {
        attempts = 0;
        // The first connect happens right after the page fetched its data. A
        // REconnect may have missed changes while it was away.
        if (openedBefore) refresh();
        openedBefore = true;
      };
      source.addEventListener("changed", (e: MessageEvent) => {
        // Version-gate: only invalidate if the version actually increased.
        // This filters out duplicate signals from the backstop poll + an
        // in-process publish that fired at the same time.
        try {
          const payload = JSON.parse(e.data) as { v?: number };
          const v = payload.v ?? 0;
          if (v <= lastVersion) return;
          lastVersion = v;
        } catch {
          // Malformed payload — refresh anyway, it's safer.
        }
        refresh();
      });
      source.addEventListener("ready", (e: MessageEvent) => {
        // On (re)connect the server sends the current version. Sync our gate
        // so we don't invalidate for stale events the server replays.
        try {
          const payload = JSON.parse(e.data) as { v?: number };
          lastVersion = payload.v ?? 0;
        } catch {
          // Ignore — we'll just be conservative and refresh on next signal.
        }
      });
      source.onerror = () => {
        // EventSource retries on its own with no backoff. Close it and manage
        // reconnects here so a down server cannot burn the rate-limit quota.
        source?.close();
        source = null;
        attempts += 1;
        retryTimer = window.setTimeout(
          connect,
          Math.min(MAX_RETRY_MS, INITIAL_RETRY_MS * 2 ** (attempts - 1)),
        );
      };
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (hiddenAt > 0 && Date.now() - hiddenAt >= MIN_AWAY_MS) refresh();
        hiddenAt = 0;
      } else {
        hiddenAt = Date.now();
      }
    };
    const onOnline = () => refresh();

    connect();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      source?.close();
      window.clearTimeout(retryTimer);
      window.clearTimeout(debounceTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [signedIn, qc]);

  return null;
}

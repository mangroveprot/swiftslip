import { useSyncExternalStore } from "react";

import { toast } from "./toast";

/**
 * Install (PWA) plumbing.
 *
 * Chromium fires `beforeinstallprompt` once per page load, some time after the
 * service worker is in control. The event must be stored and replayed from a
 * click, so it lives at module scope, a listener mounted with React could
 * easily miss it (and StrictMode would mount it twice).
 */

/** Chrome/Edge's deferred install prompt, not part of the TS DOM lib. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  /** The browser offered a prompt we can still replay. */
  canInstall: boolean;
  /** Running as an installed app (standalone window or home-screen icon). */
  installed: boolean;
};

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

const INITIAL: InstallState = { canInstall: false, installed: false };

let state: InstallState = INITIAL;
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function setState(next: Partial<InstallState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function runningStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function startInstallTracking() {
  if (typeof window === "undefined") return;

  if (runningStandalone()) state = { canInstall: false, installed: true };

  window.addEventListener("beforeinstallprompt", (event) => {
    // Suppress the browser's own mini-bar; the account menu is the entry point.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    setState({ canInstall: true });
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    setState({ canInstall: false, installed: true });
  });

  const standalone = window.matchMedia("(display-mode: standalone)");
  standalone.addEventListener("change", () => {
    if (standalone.matches) setState({ canInstall: false, installed: true });
  });
}

startInstallTracking();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Replays the browser's install prompt. Returns `unavailable` when there is none. */
export async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return "unavailable";

  deferred = null;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    // A prompt can only be used once; if the browser wants to offer another it
    // fires `beforeinstallprompt` again and we flip back to `canInstall`.
    setState({ canInstall: false });
    return outcome;
  } catch {
    setState({ canInstall: false });
    return "unavailable";
  }
}

/** Whether this tab can hand the install prompt to the user right now. */
export function useInstallPrompt() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  );
  return { ...snapshot, promptInstall };
}

/** iPhone / iPad detection, iOS has no install prompt, only Share → Add to Home Screen. */
export function isAppleMobile() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

/**
 * Tell the person how to install when the browser has not offered a prompt
 * (iOS, Firefox, or Chrome after it decided the app is already installed).
 */
export function showInstallHelp() {
  toast.info(
    import.meta.env.DEV
      ? "Install prompts only appear in a production build. Run “npm run build” then “npm run preview” to try it."
      : isAppleMobile()
        ? "On iPhone or iPad: tap Share, then “Add to Home Screen”."
        : "Open your browser menu and choose “Install app” or “Add to Home screen”.",
    { id: "install-app-help", duration: 9000 },
  );
}

/** Registers the PWA service worker. Production only, dev HMR must not be cached. */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD) return;

  const register = () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is an enhancement; the app runs without it.
    });
  };

  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

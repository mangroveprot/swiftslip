/**
 * Light / dark / system theme — remembered per browser, never on the account.
 *
 * The choice lives in `localStorage` under `swiftslip-theme`. It is a display
 * preference about *this* device, not data the server has any use for, so it
 * does not belong in a cookie (which would be sent on every API request) and
 * does not belong in a Supabase row (the same account is opened on a bright
 * office PC and a dim phone, and each should be able to differ).
 *
 * `index.html` runs the same logic inline before first paint — see the small
 * script in its <head>. That copy is what stops a reload flashing white; this
 * module takes over once React is mounted. Keep the two in step: same key,
 * same attribute, same `system` default.
 */

/** Where the choice is remembered. Shared with the pre-paint script in index.html. */
export const THEME_STORAGE_KEY = "swiftslip-theme";

/** `system` follows the OS setting, which is also the default for a new visitor. */
export type ThemePreference = "light" | "dark" | "system";

/** What is actually painted once `system` has been resolved. */
export type ResolvedTheme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Status-bar colour per theme; mirrors the `theme-color` meta in index.html. */
const STATUS_BAR: Record<ResolvedTheme, string> = {
  light: "#ffffff",
  dark: "#11151a",
};

/** The saved preference, or `system` when nothing usable is stored. */
export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  } catch {
    // Private-mode Safari and locked-down browsers can throw on access.
    return "system";
  }
}

/** True when the OS currently asks for a dark interface. */
export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

/** The theme a preference paints right now. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return systemPrefersDark() ? "dark" : "light";
  return preference;
}

/**
 * Paint a theme: the `dark` class on <html> is the single switch every token
 * in `styles.css` reacts to. Also keeps the mobile status bar in step, so the
 * browser chrome does not stay white above a dark page.
 */
export function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", STATUS_BAR[resolved]);
}

/** Save the choice and paint it at once. */
export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the theme still switches for this page view.
  }
  const resolved = resolveTheme(preference);
  applyTheme(resolved);
  return resolved;
}

/**
 * Call `onChange` whenever the OS switches between light and dark, so a user
 * on `system` follows their phone without touching anything. Returns the
 * unsubscribe function.
 */
export function watchSystemTheme(onChange: (resolved: ResolvedTheme) => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light");
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

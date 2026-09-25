/**
 * Static, NON-secret application settings.
 *
 * Safe to import from anywhere (browser or server). Anything that changes per
 * environment or is a secret belongs in `.env` and is exposed through
 * `env.server.ts` / `env.client.ts` instead.
 */
export const APP = {
  name: "SwiftSlip",
  tagline: "Daily time records, simplified.",
  logoPath: "/dtr-logo.png",
  mindbridgeLogoPath: "/mindbridge_logo.webp",
  faviconPath: "/favicon.png",
} as const;

export const SESSION = {
  cookieName: "swiftslip-session",
  /** How long a login lasts. */
  maxAgeSeconds: 60 * 60 * 12,
} as const;

export const BIOMETRIC_IMPORT = {
  /** Used when GEMINI_MODEL is not set in the environment. */
  defaultModel: "gemini-3.1-flash-lite",
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models",
} as const;

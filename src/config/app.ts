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
  /**
   * Every brand-aware screen (DTR/OB/COS/OT previews, sidebar, login, admin,
   * LOA header) renders the same Mindbridge artwork. Each call site keeps its
   * own size — DTR preview uses a small `h-[42px]`, the OB/COS/OT previews
   * use the full `w-[30%]`, auth/sidebar use `h-6`/`h-9`. PNG (not WebP) so
   * the DTR `.docx` export can embed it as a data-URL `<img>` — Word doesn't
   * render WebP.
   */
  logoPath: "/mindbridge_logo.png",
  obLogoPath: "/mindbridge_logo.png",
  mindbridgeLogoPath: "/mindbridge_logo.png",
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

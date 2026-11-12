/**
 * Static, NON-secret application settings.
 *
 * Safe to import from anywhere (browser or server). Anything that changes per
 * environment or is a secret belongs in `.env` and is exposed through
 * `env.server.ts` / `env.client.ts` instead.
 */
export const APP = {
  name: "SwiftSlip",
  tagline: "Employee forms and time records, simplified.",
  /**
   * Absolute origin of the deployed app. Link previews (`og:image`) require a
   * full URL — crawlers ignore a bare path — and the head is rendered before
   * `window` exists, so this cannot be derived from `location`.
   */
  siteUrl: "https://regasco.dpdns.org",
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
  /**
   * The Regasco company mark, shown instead of the Mindbridge logo when the
   * signed-in employee's `profiles.employer` is `0`. A wide wordmark
   * (3840 × 684, ≈ 5.6:1) against Mindbridge's 461 × 149 (≈ 3.1:1), so every
   * call site gives it more width than the Mindbridge logo to keep the printed
   * height similar — see `employerLogoPath()` / `useEmployerLogo()`.
   */
  regascoLogoPath: "/regasco_wordmark.webp",
  /**
   * The Regasco mascot (245 × 300, portrait) — used only on the sign-in page,
   * where there is no profile yet to pick a brand from.
   */
  regascoMascotPath: "/regasco_logo.webp",
  faviconPath: "/favicon.png",
} as const;

export const SESSION = {
  cookieName: "swiftslip-session",
  /** How long a login lasts. */
  maxAgeSeconds: 60 * 60 * 12,
} as const;

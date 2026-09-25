/**
 * Browser-safe environment.
 *
 * Only variables prefixed with `VITE_` are ever bundled into client JS, so this
 * file must never contain secrets. The app currently needs no client-side
 * variables; add them here (and to `.env.example`) when it does, e.g.:
 *
 *   VITE_SENTRY_DSN: import.meta.env["VITE_SENTRY_DSN"]
 */
export const clientEnv = {
  mode: import.meta.env.MODE,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

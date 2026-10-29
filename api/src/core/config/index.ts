import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * The ONE place that reads `process.env`.
 *
 * Add a variable by: (1) adding it to `EnvSchema`, (2) exposing it on
 * `config` below, (3) documenting it in `.env.example`. Everything else in
 * the API imports `config` from here.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(9095),
  TIME_ZONE: z.string().default('Asia/Manila'),
  CORS_ORIGIN: z.string().default('http://localhost:8080'),
  BODY_LIMIT: z.string().default('15mb'),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  // How many reverse proxies sit in front of the API (0 = none). Needed so
  // `req.ip` is the visitor, not the proxy — it feeds the sign-in throttle.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Folder holding the built web app (web/dist). When set (and it contains an
  // index.html) the API also serves the website, so one service does both.
  // Unset in development, where Vite serves the web app.
  WEB_DIST: z.string().min(1).optional(),

  // Sign-in cookie. Changing it signs everyone out.
  SESSION_SECRET: z
    .string()
    .min(32, 'must be at least 32 characters (try: openssl rand -hex 32)'),
  SESSION_COOKIE_NAME: z.string().default('swiftslip-session'),
  SESSION_MAX_AGE_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 12),

  // Supabase (Dashboard → Project Settings → API)
  SUPABASE_URL: z
    .string()
    .url('must be a valid URL, e.g. https://xxxx.supabase.co'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Gemini (Google AI Studio). Unset = every AI feature is switched off.
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-3.1-flash-lite'),

  // RGC asset inventory — a SEPARATE Postgres database from SwiftSlip's
  // Supabase. Unset = the inventory endpoints answer "not configured" (503).
  RGC_INVENTORY_DATABASE_URL: z
    .string()
    .url('must be a postgresql:// connection string')
    .refine(
      (v) => v.startsWith('postgresql://') || v.startsWith('postgres://'),
      {
        message: 'must start with postgresql:// or postgres://',
      },
    )
    .optional(),
});

/** Treat `FOO=` (empty string) the same as "not set". */
function readEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    out[key] = value === '' ? undefined : value;
  }
  return out;
}

function buildConfig() {
  const parsed = EnvSchema.safeParse(readEnv());
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid or missing environment variables:\n${problems}\n` +
        'Run `npm run setup`, then fill in api/.env.',
    );
  }
  const env = parsed.data;

  // Production must name its origin(s) on purpose: the localhost default would
  // silently block the real site (or, worse, be copied around as "working").
  if (env.NODE_ENV === 'production' && !readEnv()['CORS_ORIGIN']) {
    throw new Error(
      'Invalid or missing environment variables:\n' +
        '  - CORS_ORIGIN: required when NODE_ENV=production ' +
        '(the web app origin, e.g. https://swiftslip.example.com)\n',
    );
  }

  return {
    runningProd: env.NODE_ENV === 'production',
    port: env.PORT,
    timeZone: env.TIME_ZONE,
    bodyLimit: env.BODY_LIMIT,
    trustProxy: env.TRUST_PROXY,
    /** `undefined` means this process serves only the API. */
    webDist: env.WEB_DIST,
    cors: {
      origins: env.CORS_ORIGIN.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
    rate: {
      limit: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
    },
    session: {
      secret: env.SESSION_SECRET,
      cookieName: env.SESSION_COOKIE_NAME,
      maxAgeSeconds: env.SESSION_MAX_AGE_SECONDS,
    },
    gemini: {
      /** `undefined` means the AI features answer "not configured". */
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    },
    db: {
      rgc: {
        /** `undefined` means the inventory endpoints answer "not configured". */
        url: env.RGC_INVENTORY_DATABASE_URL,
      },
      supabase: {
        url: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  };
}

export type Config = ReturnType<typeof buildConfig>;

export const config: Config = buildConfig();

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

  // Backblaze B2 (S3 API) — an OPTIONAL second storage backend for new
  // features, beside the Supabase Storage attachments (which keep working
  // exactly as before). Unset = the /files endpoints answer "not configured"
  // (503). See STORAGE_GUIDE.md.
  B2_ENDPOINT: z
    .string()
    .url('must be a valid URL, e.g. https://s3.us-west-004.backblazeb2.com')
    .optional(),
  B2_REGION: z.string().min(1).default('us-west-004'),
  B2_BUCKET: z.string().min(1).default('swiftslip'),
  B2_UPLOAD_KEY_ID: z.string().min(1).optional(),
  B2_UPLOAD_APP_KEY: z.string().min(1).optional(),
  // Optional public read front door (Cloudflare Worker) for files that are
  // genuinely public. Private files use presigned GET URLs instead.
  FILE_BASE_URL: z
    .string()
    .url('must be a valid URL, e.g. https://files.example.com')
    .optional(),
  // Upload limits for the B2 store. 10 MB is the wire ceiling too (the body
  // arrives as base64 JSON and BODY_LIMIT must hold it).
  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(10).default(10),

  // Allowed MIME types for uploads.
  ALLOWED_MIME: z
    .string()
    .min(1)
    .default('image/jpeg,image/png,image/webp,application/pdf'),

  // Storage settings: plan limits, the "first-full-then-second" rule, and orphan
  // cleanup grace periods. These are read at runtime and used by the storage
  // service to decide which backend to use for new uploads and to render stats.
  SUPABASE_STORAGE_LIMIT_MB: z.coerce.number().int().positive().default(1024),
  B2_STORAGE_LIMIT_MB: z.coerce.number().int().positive().default(10240),
  // When free space falls below this percentage, new files stop going to
  // Supabase (under the "supabase-first" rule). 1 means 1% free → switch at
  // 99% used; the mockup's default reads "When Supabase is < 1 % full".
  STORAGE_MIN_FREE_PERCENT: z.coerce.number().int().min(1).max(50).default(1),
  // How often usage objects are cached (seconds). Shorter = more accurate but
  // more listing overhead.
  STORAGE_USAGE_CACHE_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(3600)
    .default(60),
  // When cleaning up orphans, skip objects newer than this (seconds). A just-
  // finished upload may still be saving its row.
  STORAGE_ORPHAN_GRACE_SECONDS: z.coerce
    .number()
    .int()
    .min(0)
    .max(86400)
    .default(600),
  // The private Supabase Storage bucket the form attachments live in. The
  // default matches the bucket the app has always used.
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default('swiftslip'),
  // Optional public dashboard URL; falls back to a derived URL from
  // SUPABASE_URL if unset.
  SUPABASE_STORAGE_DASHBOARD_URL: z.string().url().optional(),
  B2_DASHBOARD_URL: z
    .string()
    .url()
    .default('https://secure.backblaze.com/b2_buckets.htm'),
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
    // Optional Backblaze B2 backend (future features). The existing
    // Supabase Storage attachments are configured through `db.supabase`.
    storage: {
      /** Public read front door, when one is set (no trailing slash). */
      baseUrl: env.FILE_BASE_URL?.replace(/\/+$/, ''),
      maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
      allowedMime: env.ALLOWED_MIME.split(',')
        .map((type) => type.trim().toLowerCase())
        .filter(Boolean),
      b2: {
        endpoint: env.B2_ENDPOINT?.replace(/\/+$/, ''),
        region: env.B2_REGION,
        bucket: env.B2_BUCKET,
        uploadKeyId: env.B2_UPLOAD_KEY_ID,
        uploadAppKey: env.B2_UPLOAD_APP_KEY,
        /** Endpoint + upload credentials all present = the /files app is on. */
        configured: Boolean(
          env.B2_ENDPOINT && env.B2_UPLOAD_KEY_ID && env.B2_UPLOAD_APP_KEY,
        ),
        /** Public read front door for B2 (Cloudflare Worker). */
        dashboardUrl: env.B2_DASHBOARD_URL,
      },
      // Plan limits and the "Supabase first → B2 overflow" rule.
      limits: {
        supabaseBytes: env.SUPABASE_STORAGE_LIMIT_MB * 1024 * 1024,
        b2Bytes: env.B2_STORAGE_LIMIT_MB * 1024 * 1024,
      },
      // "Supabase is full" threshold: switch to B2 when free space < this %.
      defaults: {
        minFreePercent: env.STORAGE_MIN_FREE_PERCENT,
      },
      // List/cache timeouts.
      usageCacheSeconds: env.STORAGE_USAGE_CACHE_SECONDS,
      orphanGraceSeconds: env.STORAGE_ORPHAN_GRACE_SECONDS,
      // Public dashboard URLs.
      supabase: {
        bucket: env.SUPABASE_STORAGE_BUCKET,
        limitBytes: env.SUPABASE_STORAGE_LIMIT_MB * 1024 * 1024,
        dashboardUrl: env.SUPABASE_STORAGE_DASHBOARD_URL,
      },
    },
  };
}

export type Config = ReturnType<typeof buildConfig>;

export const config: Config = buildConfig();

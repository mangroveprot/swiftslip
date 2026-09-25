/**
 * Server-only environment — the ONE place that reads `process.env`.
 *
 * Change or add an environment variable here and nowhere else:
 *   1. add it to `EnvSchema` below,
 *   2. expose it in `buildConfig()`,
 *   3. document it in `.env.example`.
 *
 * Everything else in the backend consumes `getServerConfig()`.
 *
 * Values are parsed lazily (on first use, then cached) rather than at import
 * time, because on edge/worker runtimes secrets only exist once a request is
 * being handled.
 */
import { z } from "zod";

import { BIOMETRIC_IMPORT, SESSION } from "./app";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Supabase (Dashboard → Project Settings → API)
  SUPABASE_URL: z.string().url("must be a valid URL, e.g. https://xxxx.supabase.co"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Signs the login cookie. Generate with: openssl rand -hex 32
  SESSION_SECRET: z.string().min(32, "must be at least 32 characters"),

  // Optional: AI biometric import. Leave GEMINI_API_KEY empty to disable it.
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
});

/** Treat `FOO=` (empty string) the same as "not set". */
function readEnv(): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    out[key] = value === "" ? undefined : value;
  }
  return out;
}

function buildConfig() {
  const parsed = EnvSchema.safeParse(readEnv());
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${problems}\n` +
        "Copy .env.example to .env and fill in the values.",
    );
  }
  const env = parsed.data;

  return {
    isProd: env.NODE_ENV === "production",
    supabase: {
      url: env.SUPABASE_URL,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
    session: {
      secret: env.SESSION_SECRET,
      cookieName: SESSION.cookieName,
      maxAgeSeconds: SESSION.maxAgeSeconds,
    },
    gemini: {
      /** `undefined` means the AI import feature is switched off. */
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL ?? BIOMETRIC_IMPORT.defaultModel,
    },
  };
}

export type ServerConfig = ReturnType<typeof buildConfig>;

let cached: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  return (cached ??= buildConfig());
}

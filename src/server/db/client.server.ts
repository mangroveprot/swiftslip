/**
 * Supabase admin client (service role — bypasses RLS).
 *
 * SECURITY: server-only. Import it from `src/server/**` and nowhere else.
 * Configuration comes from `@/config/env.server`, never from `process.env`.
 */
import { createClient } from "@supabase/supabase-js";

import { getServerConfig } from "@/config/env.server";
import type { Database } from "./database.types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

/** New-style Supabase keys are opaque strings, not JWTs, so they must not be sent as a Bearer token. */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createAdminClient() {
  const { url, serviceRoleKey } = getServerConfig().supabase;
  return createClient<Database>(url, serviceRoleKey, {
    global: { fetch: createSupabaseFetch(serviceRoleKey) },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

export type Db = ReturnType<typeof createAdminClient>;

let db: Db | undefined;

export function getDb(): Db {
  return (db ??= createAdminClient());
}

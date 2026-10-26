/**
 * Supabase admin client (service role — bypasses RLS).
 *
 * SECURITY: server-only. Nothing outside the API may hold this key. Every
 * query must therefore scope itself to the signed-in user (e.g. `owner_id`) —
 * the database will not do it for you.
 */
import { createClient } from '@supabase/supabase-js';

import { config } from '../../../config';
import type { Database } from './database.types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

/** New-style Supabase keys are opaque strings, not JWTs, so they must not be sent as a Bearer token. */
function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request
        ? input.headers
        : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) =>
        headers.set(key, value),
      );
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get('Authorization') === `Bearer ${supabaseKey}`
    ) {
      headers.delete('Authorization');
    }
    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createAdminClient() {
  const { url, serviceRoleKey } = config.db.supabase;
  return createClient<Database>(url, serviceRoleKey, {
    global: { fetch: createSupabaseFetch(serviceRoleKey) },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export type Db = ReturnType<typeof createAdminClient>;

let db: Db | undefined;

export function getDb(): Db {
  return (db ??= createAdminClient());
}

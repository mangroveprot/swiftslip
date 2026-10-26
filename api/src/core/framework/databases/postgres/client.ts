/**
 * Direct Postgres client for the RGC asset-inventory database.
 *
 * SEPARATE from the Supabase client: different connection string, different
 * tables. Inventory data is read and written only here and never copied into
 * SwiftSlip's database. Only `apps/inventory-*` repositories may use it.
 */
import postgres from 'postgres';

import { config } from '../../../config';
import { ErrorResponse } from '../../../../common/shared/utils/error';

export type RgcSql = ReturnType<typeof postgres>;

let sql: RgcSql | undefined;

/** Lazily opens the pool. Throws 503 when `RGC_INVENTORY_DATABASE_URL` is unset. */
export function getRgcSql(): RgcSql {
  if (sql) return sql;
  const url = config.db.rgc.url;
  if (!url) {
    throw new ErrorResponse(
      'SERVICE_UNAVAILABLE',
      'The inventory database is not configured. Set RGC_INVENTORY_DATABASE_URL in api/.env.',
    );
  }
  sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    // Supabase poolers only speak TLS; a plain/local Postgres may not.
    ...(url.includes('supabase') ? { ssl: 'require' as const } : {}),
  });
  return sql;
}

/**
 * `timestamp without time zone` values in this DB are UTC wall-clock
 * (matches the original `DateTime.SpecifyKind(DateTime.UtcNow, Unspecified)`).
 */
export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '');
}

/** Closes the pool (used on shutdown). */
export async function closeRgc(): Promise<void> {
  if (!sql) return;
  const current = sql;
  sql = undefined;
  await current.end({ timeout: 5 });
}

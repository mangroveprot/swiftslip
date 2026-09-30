/**
 * Direct Postgres client for the RGC asset-inventory database.
 *
 * SEPARATE from SwiftSlip's Supabase client (`src/server/db/client.server.ts`):
 * different connection string, different tables — inventory data is read/written
 * only in the RGC database and never copied into SwiftSlip's.
 *
 * SECURITY: server-only (`*.server.ts`). Configuration comes from
 * `@/config/env.server`, never from `process.env`.
 */
import postgres from "postgres";

import { getServerConfig } from "@/config/env.server";

export type RgcSql = ReturnType<typeof postgres>;

let sql: RgcSql | undefined;

export function getRgcSql(): RgcSql {
  if (!sql) {
    const url = getServerConfig().rgcInventory.databaseUrl;
    sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Supabase poolers only speak TLS; a plain/local Postgres may not.
      ...(url.includes("supabase") ? { ssl: "require" as const } : {}),
    });
  }
  return sql;
}

/**
 * `timestamp without time zone` values in this DB are UTC wall-clock
 * (matches the original `DateTime.SpecifyKind(DateTime.UtcNow, Unspecified)` inserts).
 */
export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "");
}

/** Extracts the useful message from a driver/DB error (the C# code used `InnerException.Message`). */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

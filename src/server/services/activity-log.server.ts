/**
 * The admin panel's audit trail: one best-effort row per notable action
 * (sign-ins, OB / DTR create & remove, attachments, account changes).
 * Writing a log must never break the action it describes — `logActivity`
 * swallows every failure and only reports it to the server console.
 */
import { getRequestIP } from "@tanstack/react-start/server";

import { getDb } from "@/server/db/client.server";
import { ACTIVITY_LOG_PAGE_SIZE } from "@/shared/schemas";

/** Rows older than this are dropped by the table's trigger and by reads. */
const RETENTION_DAYS = 30;

export type ActivityAction =
  | "signin.success"
  | "signin.failed"
  | "ob.created"
  | "ob.deleted"
  | "record.created"
  | "record.deleted"
  | "attachment.uploaded"
  | "attachment.removed"
  | "user.created"
  | "user.updated"
  | "user.deleted";

export type ActivityEntry = {
  action: ActivityAction;
  /** Who did it — absent on rejected sign-in attempts (nobody was verified). */
  actorId?: string;
  actorName?: string;
  actorNumber?: string;
  /** What it happened to, in plain words (person, form, account…). */
  target?: string;
  detail?: string | null;
  /** Remote address; sign-in attempts only. */
  ip?: string;
};

/** Append one row to the activity log. Best effort — never throws. */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    const { error } = await getDb()
      .from("activity_logs")
      .insert({
        action: entry.action,
        actor_id: entry.actorId ?? null,
        actor_name: entry.actorName ?? null,
        actor_number: entry.actorNumber ?? null,
        target: entry.target ?? null,
        detail: entry.detail ?? null,
        ip: entry.ip ?? null,
      });
    if (error) console.error(`[activity-log] ${error.message}`);
  } catch (err) {
    console.error("[activity-log]", err);
  }
}

/** Best-effort client IP for sign-in attempts ("" when it can't be read). */
export function requestIp(): string {
  try {
    return getRequestIP({ xForwardedFor: true }) ?? "";
  } catch {
    return "";
  }
}

/**
 * One filtered page of the log for the admin panel: text search, optional
 * date range, newest first. Also prunes expired rows before reading so
 * nothing past the 30-day retention window is ever shown.
 */
export async function listActivityLogs(filters: {
  search: string;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
}) {
  const db = getDb();
  await db
    .from("activity_logs")
    .delete()
    .lt("created_at", new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());

  let query = db.from("activity_logs").select("*", { count: "exact" });
  // Commas/percent/parens are PostgREST `or=` syntax — drop them from the term.
  const term = filters.search
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (term) {
    query = query.or(
      `actor_name.ilike.%${term}%,actor_number.ilike.%${term}%,action.ilike.%${term}%,target.ilike.%${term}%,detail.ilike.%${term}%`,
    );
  }
  if (filters.from) query = query.gte("created_at", filters.from);
  if (filters.to) query = query.lt("created_at", filters.to);

  const offset = (filters.page - 1) * ACTIVITY_LOG_PAGE_SIZE;
  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + ACTIVITY_LOG_PAGE_SIZE - 1);
  if (error) {
    throw new Error(
      `Could not load activity logs (${error.message}). ` +
        "On a fresh setup, run the 0011_activity_logs.sql migration first.",
    );
  }
  return { rows: data ?? [], total: count ?? 0 };
}

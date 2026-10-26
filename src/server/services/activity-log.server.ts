/**
 * The admin panel's audit trail: one best-effort row per notable action
 * (sign-ins, OB / DTR create & remove, attachments, account changes,
 * inventory asset/report activity).
 * Writing a log must never break the action it describes — `logActivity`
 * swallows every failure and only reports it to the server console.
 */
import { getRequestIP } from "@tanstack/react-start/server";

import { getDb } from "@/server/db/client.server";
import { ACTION_LABELS } from "@/shared/activity";
import {
  ACTIVITY_LOG_PAGE_SIZE,
  type ActivityLogActionFilter,
  type ActivityLogCounts,
  type ActivityLogFeed,
} from "@/shared/schemas";

/** Rows older than this are dropped by the table's trigger and by reads. */
const RETENTION_DAYS = 30;

export type ActivityAction =
  | "signin.success"
  | "signin.failed"
  | "ob.created"
  | "ob.deleted"
  | "loa.created"
  | "loa.deleted"
  | "cos.created"
  | "cos.deleted"
  | "ot.created"
  | "ot.deleted"
  | "record.created"
  | "record.deleted"
  | "attachment.uploaded"
  | "attachment.removed"
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "access.updated"
  | "org.updated"
  | "asset.created"
  | "asset.updated"
  | "report.downloaded"
  | "ai.request";

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
 * Failed sign-ins inside the rolling window, per ID number and per IP.
 *
 * Backed by `activity_logs` rather than a per-isolate counter so the limit
 * holds across Workers instances and cold starts. The query is cheap: the
 * `created_at` index narrows it to the window (minutes of rows) before the
 * action/number filters apply.
 */
export async function countRecentSignInFailures(
  actorNumber: string,
  ip: string,
  windowMinutes: number,
): Promise<{ byId: number; byIp: number }> {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const db = getDb();

  const [byId, byIp] = await Promise.all([
    db
      .from("activity_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "signin.failed")
      .eq("actor_number", actorNumber)
      .gte("created_at", since),
    ip
      ? db
          .from("activity_logs")
          .select("id", { count: "exact", head: true })
          .eq("action", "signin.failed")
          .eq("ip", ip)
          .gte("created_at", since)
      : Promise.resolve({ count: 0 }),
  ]);

  return { byId: byId.count ?? 0, byIp: byIp.count ?? 0 };
}

/** Which actions each dashboard side-panel feed shows. */
const FEED_ACTIONS: Record<ActivityLogFeed, string[]> = {
  security: ["signin.success", "signin.failed"],
  activity: [
    "ob.created",
    "ob.deleted",
    "loa.created",
    "loa.deleted",
    "cos.created",
    "cos.deleted",
    "ot.created",
    "ot.deleted",
    "record.created",
    "record.deleted",
    "attachment.uploaded",
    "attachment.removed",
    "asset.created",
    "asset.updated",
    "report.downloaded",
    // Admin-panel changes belong in Latest activity too, not only in the
    // full audit log.
    "user.created",
    "user.updated",
    "user.deleted",
    "access.updated",
    "org.updated",
  ],
};

/** Drop rows past the 30-day window before anyone can see them. */
async function pruneExpired(): Promise<void> {
  await getDb()
    .from("activity_logs")
    .delete()
    .lt("created_at", new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());
}

/**
 * The newest `limit` rows of one dashboard feed: `security` (sign-ins) or
 * `activity` (forms, attachments, inventory, and admin changes). Prunes
 * expired rows first, like every other read of the log.
 */
export async function listActivityFeed(feed: ActivityLogFeed, limit: number) {
  await pruneExpired();
  const { data, error } = await getDb()
    .from("activity_logs")
    .select("*")
    .in("action", FEED_ACTIONS[feed])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(
      `Could not load activity (${error.message}). ` +
        "On a fresh setup, run the 0011_activity_logs.sql migration first.",
    );
  }
  return data ?? [];
}

/** Filter tokens → the `action` rows they cover (see activityLogActionFilter). */
const ACTION_GROUPS: Record<ActivityLogActionFilter, string[]> = {
  signin: ["signin.success"],
  "signin-failed": ["signin.failed"],
  access: ["access.updated"],
  accounts: ["user.created", "user.updated", "user.deleted"],
  records: [
    "ob.created",
    "ob.deleted",
    "loa.created",
    "loa.deleted",
    "cos.created",
    "cos.deleted",
    "ot.created",
    "ot.deleted",
    "record.created",
    "record.deleted",
    "attachment.uploaded",
    "attachment.removed",
    "asset.created",
    "asset.updated",
    "report.downloaded",
    "org.updated",
  ],
};

/**
 * The five category counts plus the total, for one date range. Counts ignore
 * the text search and the active tab on purpose: the tabs stay stable while
 * the admin narrows the list below them.
 */
export async function listActivityLogCounts(filters: {
  from?: string | undefined;
  to?: string | undefined;
}): Promise<ActivityLogCounts> {
  const db = getDb();

  async function countFor(actions?: string[]) {
    let query = db.from("activity_logs").select("id", { count: "exact", head: true });
    if (actions) query = query.in("action", actions);
    if (filters.from) query = query.gte("created_at", filters.from);
    if (filters.to) query = query.lt("created_at", filters.to);
    const { count, error } = await query;
    if (error) {
      throw new Error(
        `Could not count activity logs (${error.message}). ` +
          "On a fresh setup, run the 0011_activity_logs.sql migration first.",
      );
    }
    return count ?? 0;
  }

  const [all, signin, signinFailed, access, accounts, records] = await Promise.all([
    countFor(),
    countFor(ACTION_GROUPS.signin),
    countFor(ACTION_GROUPS["signin-failed"]),
    countFor(ACTION_GROUPS.access),
    countFor(ACTION_GROUPS.accounts),
    countFor(ACTION_GROUPS.records),
  ]);

  return { all, signin, "signin-failed": signinFailed, access, accounts, records };
}

/**
 * One filtered page of the log for the admin panel: text search, optional
 * date range, newest first. Also prunes expired rows before reading so
 * nothing past the 30-day retention window is ever shown.
 */
export async function listActivityLogs(filters: {
  search: string;
  action?: ActivityLogActionFilter | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
}) {
  const db = getDb();
  await pruneExpired();

  let query = db.from("activity_logs").select("*", { count: "exact" });
  const actions = filters.action ? ACTION_GROUPS[filters.action] : undefined;
  if (actions) query = query.in("action", actions);
  // Commas/percent/parens are PostgREST `or=` syntax — drop them from the term.
  const term = filters.search
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (term) {
    const searchParts = [
      `actor_name.ilike.%${term}%`,
      `actor_number.ilike.%${term}%`,
      `action.ilike.%${term}%`,
      `target.ilike.%${term}%`,
      `detail.ilike.%${term}%`,
      `ip.ilike.%${term}%`,
    ];
    // "signed in", "approval slip", "OB created"… The raw action names are
    // machine keys, so also match the labels the UI actually shows. Tokens
    // (rather than the whole phrase) make "failed sign-in" find the
    // "Sign-in failed" label even though the word order differs.
    if (term.length >= 3) {
      const lowered = term.toLowerCase();
      const tokens = lowered.split(/\s+/).filter(Boolean);
      const labelActions = Object.entries(ACTION_LABELS)
        .filter(([, label]) => {
          const text = label.toLowerCase();
          return text.includes(lowered) || tokens.every((token) => text.includes(token));
        })
        .map(([action]) => action);
      if (labelActions.length) {
        searchParts.push(`action.in.(${labelActions.join(",")})`);
      }
    }
    query = query.or(searchParts.join(","));
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

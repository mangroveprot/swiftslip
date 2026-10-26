import { getDb } from "@/server/db/client.server";
import type { FormEvent, FormKind } from "@/shared/forms";
import { departmentForPosition } from "@/shared/org";

import { listAccessCodes } from "./access-codes.server";

export type SecuritySummary = {
  /** Successful sign-ins since local midnight. */
  signinsToday: number;
  /** Rejected attempts since local midnight. */
  failedToday: number;
  /** Today's successful sign-ins grouped by IP, busiest first. */
  ipCounts: { ip: string | null; count: number }[];
  /** Non-loopback IPs used for the first time by an account today. */
  newIpKeys: { actorNumber: string; ip: string }[];
  /** Distinct people who signed in today, most recent first. */
  actors: string[];
  /** The most recent successful sign-in today, if any. */
  latest: {
    actor_name: string | null;
    actor_number: string | null;
    ip: string | null;
    created_at: string;
  } | null;
};

export type AdminStats = {
  accounts: number;
  administrators: number;
  records: number;
  /** Every OB / LOA / COS / OT form on file. */
  forms: number;
  /** Accounts missing a name, office, department, or position. */
  incompleteProfiles: number;
  /**
   * Creation timestamps for every form filed in the last six months. The
   * dashboard buckets these on the client so "this month", "last month" and
   * the weekly chart all use the viewer's local calendar rather than the
   * server's timezone.
   */
  formEvents: FormEvent[];
  security: SecuritySummary;
};

type CountableTable = "users" | "dtr_records" | "ob_forms" | "loa_forms" | "cos_forms" | "ot_forms";

async function countRows(table: CountableTable) {
  const { count, error } = await getDb().from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const FORM_TABLES: ReadonlyArray<{
  table: "ob_forms" | "loa_forms" | "cos_forms" | "ot_forms";
  type: FormKind;
}> = [
  { table: "ob_forms", type: "ob" },
  { table: "loa_forms", type: "loa" },
  { table: "cos_forms", type: "cos" },
  { table: "ot_forms", type: "ot" },
];

/** One row per form created since `sinceIso`, across all four form tables. */
async function formEventsSince(sinceIso: string): Promise<FormEvent[]> {
  const groups = await Promise.all(
    FORM_TABLES.map(async ({ table, type }) => {
      const { data, error } = await getDb()
        .from(table)
        .select("created_at")
        .gte("created_at", sinceIso);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({ type, created_at: row.created_at }));
    }),
  );
  return groups.flat();
}

/**
 * A profile is incomplete until it says who the person is and where they work:
 * the real name, the Designation (office), the Department, and the Position.
 * Mirrors the rule in User management so the dashboard's warning links to the
 * exact same rows.
 */
function isProfileIncomplete(account: {
  full_name: string;
  designation: string;
  department: string;
  position: string;
}) {
  return (
    !account.full_name.trim() ||
    !account.designation.trim() ||
    !(account.department.trim() || departmentForPosition(account.position)) ||
    !account.position.trim()
  );
}

async function countIncompleteProfiles() {
  try {
    const accounts = await listAccessCodes();
    return accounts.filter(isProfileIncomplete).length;
  } catch (error) {
    // A missing profiles table shouldn't take the whole dashboard down; the
    // warning simply reads zero until the setup is finished.
    console.error("[admin-stats] incomplete profiles", error);
    return 0;
  }
}

function isLoopbackIp(ip: string) {
  return ip === "::1" || ip === "127.0.0.1" || ip === "::ffff:127.0.0.1";
}

/**
 * Today's sign-in summary. `activity_logs` only keeps 30 days, so a simple
 * range query is enough; failures are swallowed so a fresh install without the
 * log table still gets the rest of the dashboard.
 */
async function getSecuritySummary(): Promise<SecuritySummary> {
  const empty: SecuritySummary = {
    signinsToday: 0,
    failedToday: 0,
    ipCounts: [],
    newIpKeys: [],
    actors: [],
    latest: null,
  };

  try {
    const db = getDb();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const retentionStart = new Date(now.getTime() - 30 * 86_400_000).toISOString();

    const [signins, failed, priorSignins] = await Promise.all([
      db
        .from("activity_logs")
        .select("actor_name,actor_number,ip,created_at")
        .eq("action", "signin.success")
        .gte("created_at", today)
        .order("created_at", { ascending: false }),
      db
        .from("activity_logs")
        .select("id", { count: "exact", head: true })
        .eq("action", "signin.failed")
        .gte("created_at", today),
      db
        .from("activity_logs")
        .select("actor_number,ip")
        .eq("action", "signin.success")
        .gte("created_at", retentionStart)
        .lt("created_at", today),
    ]);

    if (signins.error) throw new Error(signins.error.message);
    if (failed.error) throw new Error(failed.error.message);
    if (priorSignins.error) throw new Error(priorSignins.error.message);

    const priorIpKeys = new Set(
      (priorSignins.data ?? []).map(
        (row) => `${row.actor_number?.trim() ?? ""}\u0000${row.ip?.trim() ?? ""}`,
      ),
    );
    const ipCounts = new Map<string, number>();
    const newIpKeys = new Set<string>();
    const actors: string[] = [];
    for (const row of signins.data ?? []) {
      const ip = row.ip?.trim() ?? "";
      const actorNumber = row.actor_number?.trim() ?? "";
      ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
      if (ip && actorNumber && !isLoopbackIp(ip) && !priorIpKeys.has(`${actorNumber}\u0000${ip}`)) {
        newIpKeys.add(`${actorNumber}\u0000${ip}`);
      }
      const actor = row.actor_name?.trim() || actorNumber;
      if (actor && !actors.includes(actor)) actors.push(actor);
    }

    return {
      signinsToday: signins.data?.length ?? 0,
      failedToday: failed.count ?? 0,
      ipCounts: [...ipCounts.entries()]
        .map(([ip, count]) => ({ ip: ip || null, count }))
        .sort((a, b) => b.count - a.count),
      newIpKeys: [...newIpKeys].map((key) => {
        const [actorNumber = "", ip = ""] = key.split("\u0000");
        return { actorNumber, ip };
      }),
      actors,
      latest: signins.data?.[0] ?? null,
    };
  } catch (error) {
    console.error("[admin-stats] security summary", error);
    return empty;
  }
}

/** Dashboard numbers for the admin panel: totals, form history and security. */
export async function getAdminStats(): Promise<AdminStats> {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  const [
    accounts,
    records,
    ob,
    loa,
    cos,
    ot,
    administrators,
    incompleteProfiles,
    formEvents,
    security,
  ] = await Promise.all([
    countRows("users"),
    countRows("dtr_records"),
    countRows("ob_forms"),
    countRows("loa_forms"),
    countRows("cos_forms"),
    countRows("ot_forms"),
    getDb()
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .then(({ count }) => count ?? 0),
    countIncompleteProfiles(),
    formEventsSince(since.toISOString()),
    getSecuritySummary(),
  ]);

  return {
    accounts,
    administrators,
    records,
    forms: ob + loa + cos + ot,
    incompleteProfiles,
    formEvents,
    security,
  };
}

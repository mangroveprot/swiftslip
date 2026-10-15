import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/session.server";
import { resolveAccess } from "@/server/auth/access.server";
import { logActivity } from "@/server/services/activity-log.server";
import { getDb } from "@/server/db/client.server";
import { idInput } from "@/shared/schemas";
import { departmentForPosition, normalizePosition } from "@/shared/org";
import {
  GRANTABLE_APP_KEYS,
  RULE_SCOPES,
  type AccessRule,
  type GrantableAppKey,
  type Role,
  type RuleScope,
} from "@/shared/types";

const ruleInput = z.object({
  app_key: z.enum(GRANTABLE_APP_KEYS),
  scope: z.enum(RULE_SCOPES),
  scope_value: z.string().trim().min(1).max(200),
  allow: z.boolean(),
});

/**
 * Every rule, joined with the label it applies to. Admin-only — the rules are
 * the thing this whole feature exists to manage.
 *
 * Rules that target a user are labelled with that account's ID number and name
 * so an admin is not reading raw UUIDs.
 */
export const listAccessRules = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const db = getDb();
  const [rulesRes, usersRes] = await Promise.all([
    db.from("app_access_rules").select("id,app_key,scope,scope_value,allow").order("scope"),
    db.from("users").select("id,id_number"),
  ]);
  if (rulesRes.error) {
    // Migration 0022 has not been run — report it rather than pretending there
    // are no rules, which would hide the reason nothing is being enforced.
    throw new Error(
      "This needs a pending database update. Run drizzle/migrations/0022_app_access_rules.sql first.",
    );
  }
  const ids = new Map((usersRes.data ?? []).map((u) => [u.id, u.id_number]));
  return ((rulesRes.data ?? []) as AccessRule[]).map((r) => ({
    ...r,
    scope_value: r.scope === "user" ? (ids.get(r.scope_value) ?? r.scope_value) : r.scope_value,
  }));
});

/** Create or replace one rule. The unique index makes it an upsert. */
export const setAccessRule = createServerFn({ method: "POST" })
  .validator(ruleInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const db = getDb();
    // Stored canonically. `resolveAccess` compares canonically too, so this is
    // tidiness rather than correctness — but it keeps the table readable.
    // Department scope_value is trimmed directly; position scope is
    // normalized against the POSITION_ALIASES map (currently empty).
    const scopeValue =
      data.scope === "position" ? normalizePosition(data.scope_value) : data.scope_value.trim();
    const { error } = await db
      .from("app_access_rules")
      .upsert(
        {
          app_key: data.app_key as GrantableAppKey,
          scope: data.scope as RuleScope,
          scope_value: scopeValue,
          allow: data.allow,
        },
        { onConflict: "app_key,scope,scope_value" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity({
      action: "access.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: `${data.app_key} · ${data.scope}: ${scopeValue}`,
      detail: data.allow ? "granted" : "denied",
    });
    return { ok: true as const };
  });

export const deleteAccessRule = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const { error } = await getDb().from("app_access_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity({
      action: "access.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: data.id,
      detail: "rule removed",
    });
    return { ok: true as const };
  });

/**
 * One row per account, department and position, with the access each one
 * actually resolves to per app.
 *
 * The EFFECTIVE answer is computed server-side by the same `resolveAccess` the
 * route guards use. Recomputing precedence in the browser is how an admin
 * screen ends up confidently showing something the guards disagree with — so
 * this returns the outcome, not the raw rules, and the grid just renders it.
 */
/** One row of the admin grid. `kind` is the rule scope it writes. */
type OverviewRow = {
  kind: RuleScope;
  scope: RuleScope;
  scopeValue: string;
  label: string;
  secondary: string;
  department: string;
  position: string;
  /** Account rows only: the grid lists administrators in their own section,
   *  because their cells are fixed and clicking them does nothing. */
  isAdmin: boolean;
  apps: ReturnType<typeof resolveAccess>[];
};

export const getAccessOverview = createServerFn({ method: "GET" }).handler(
  // The explicit return type matters: without it the literal scope types widen
  // to `string` across the server-function boundary and the admin grid stops
  // type-checking against its own data.
  async (): Promise<{
    accounts: OverviewRow[];
    departments: OverviewRow[];
    positions: OverviewRow[];
  }> => {
    await requireAdmin();
    const db = getDb();
    const [usersRes, profilesRes, rulesRes] = await Promise.all([
      db.from("users").select("id,id_number,role"),
      db.from("profiles").select("access_code_id,full_name,department,designation"),
      db.from("app_access_rules").select("id,app_key,scope,scope_value,allow"),
    ]);
    if (rulesRes.error) {
      throw new Error(
        "This needs a pending database update. Run drizzle/migrations/0022_app_access_rules.sql first.",
      );
    }
    // Migration 0023 not applied yet: `department` doesn't exist, so retry
    // without it — every row then resolves its department from its position.
    let profileRows = profilesRes.data;
    if (profilesRes.error?.message?.includes("department")) {
      const retry = await db.from("profiles").select("access_code_id,full_name,designation");
      if (retry.error) throw new Error(retry.error.message);
      profileRows = (retry.data ?? []).map((p) => ({
        ...p,
        department: departmentForPosition(p.designation ?? ""),
      }));
    } else if (profilesRes.error) {
      throw new Error(profilesRes.error.message);
    }
    const rules = (rulesRes.data ?? []) as {
      id: string;
      app_key: string;
      scope: string;
      scope_value: string;
      allow: boolean;
    }[];

    const byAccount = new Map((profileRows ?? []).map((p) => [p.access_code_id, p] as const));

    const accounts: OverviewRow[] = (usersRes.data ?? []).map<OverviewRow>((u) => {
      const profile = byAccount.get(u.id);
      const subject = {
        role: u.role as Role,
        userId: u.id,
        department: profile?.department ?? "",
        position: profile?.designation ?? "",
      };
      return {
        // `kind` is the rule scope, so an account row is "user" — the same value
        // the rule it writes carries.
        kind: "user",
        scope: "user",
        scopeValue: u.id,
        label: u.id_number,
        secondary: profile?.full_name ?? "",
        department: subject.department,
        position: subject.position,
        isAdmin: u.role === "admin",
        apps: GRANTABLE_APP_KEYS.map((app) => resolveAccess(app, subject, rules)),
      };
    });

    // Departments and positions are the distinct values actually in use — the
    // ones a rule could ever match. A listed department with nobody in it has no
    // effect, so there is nothing to show for it.
    const seenDept = new Set<string>();
    const seenPos = new Set<string>();
    const deptRows: OverviewRow[] = [];
    const posRows: OverviewRow[] = [];

    const group = (
      scope: "department" | "position",
      label: string,
      secondary: string,
      into: OverviewRow[],
    ) => {
      if (!label) return;
      const subject = {
        role: "user" as Role,
        department: scope === "department" ? label : "",
        position: scope === "position" ? label : "",
      };
      into.push({
        kind: scope as RuleScope,
        scope: scope as RuleScope,
        scopeValue: label,
        label,
        secondary,
        department: subject.department,
        position: subject.position,
        isAdmin: false,
        apps: GRANTABLE_APP_KEYS.map((app) => resolveAccess(app, subject, rules)),
      });
    };

    for (const p of profileRows ?? []) {
      // The department the profile stores — never the office branch (`area`).
      const dept = p.department ?? "";
      if (dept && !seenDept.has(dept)) {
        seenDept.add(dept);
        group("department", dept, "", deptRows);
      }
      const pos = normalizePosition(p.designation ?? "");
      if (pos && !seenPos.has(pos)) {
        seenPos.add(pos);
        group("position", pos, "", posRows);
      }
    }

    return { accounts, departments: deptRows, positions: posRows };
  },
);

/**
 * Distinct Departments and Positions already in use on the profiles, so an
 * admin picks from real values instead of typing a spelling that silently
 * matches nobody.
 */
export const listOrgValues = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const db = getDb();
  // First try with the department column (migration 0023), fall back if it's
  // not there yet.
  const { data: profilesWithDept, error: deptError } = await db
    .from("profiles")
    .select("department,designation");
  if (!deptError && profilesWithDept) {
    const departments = new Set<string>();
    const positions = new Set<string>();
    for (const p of profilesWithDept ?? []) {
      const dept = p.department ?? "";
      if (dept) departments.add(dept);
      const pos = normalizePosition(p.designation ?? "");
      if (pos) positions.add(pos);
    }
    return {
      departments: [...departments].sort((a, b) => a.localeCompare(b)),
      positions: [...positions].sort((a, b) => a.localeCompare(b)),
    };
  }
  // Migration 0023 not applied yet — derive department from position names.
  const { data, error } = await db.from("profiles").select("designation");
  if (error) throw new Error(error.message);
  const departments = new Set<string>();
  const positions = new Set<string>();
  for (const p of data ?? []) {
    const pos = normalizePosition(p.designation ?? "");
    if (pos) positions.add(pos);
    const dept = departmentForPosition(pos);
    if (dept) departments.add(dept);
  }
  return {
    departments: [...departments].sort((a, b) => a.localeCompare(b)),
    positions: [...positions].sort((a, b) => a.localeCompare(b)),
  };
});

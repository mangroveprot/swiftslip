import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAdmin } from "@/server/auth/session.server";
import {
  APP_DEFAULT_RULE_VALUE,
  defaultAccess,
  isAppDefaultRule,
  resolveAccess,
} from "@/server/auth/access.server";
import { logActivity } from "@/server/services/activity-log.server";
import { getDb } from "@/server/db/client.server";
import { idInput } from "@/shared/schemas";
import { departmentForPosition, normalizePosition } from "@/shared/org";
import {
  GRANTABLE_APP_KEYS,
  RULE_SCOPES,
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

const appDefaultInput = z.object({
  app_key: z.enum(GRANTABLE_APP_KEYS),
  allow: z.boolean(),
});

/** Create or replace one rule. The unique index makes it an upsert. */
export const setAccessRule = createServerFn({ method: "POST" })
  .validator(ruleInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const db = getDb();
    // The starting point lives in this table under a reserved value; only
    // `setAppDefault` may write it, so a department picker can never turn it
    // into a real department rule.
    if (data.scope === "department" && data.scope_value.trim() === APP_DEFAULT_RULE_VALUE) {
      throw new Error("That name is reserved.");
    }
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
    // A user rule stores an id; the log should name the person, not the UUID.
    let shownValue = scopeValue;
    if (data.scope === "user") {
      const { data: person } = await db
        .from("users")
        .select("id_number")
        .eq("id", scopeValue)
        .maybeSingle();
      shownValue = person?.id_number ?? "removed account";
    }
    await logActivity({
      action: "access.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target: `${data.app_key} · ${data.scope}: ${shownValue}`,
      detail: data.allow ? "granted" : "denied",
    });
    return { ok: true as const };
  });

/** Change what every staff account gets for one app before any rule applies. */
export const setAppDefault = createServerFn({ method: "POST" })
  .validator(appDefaultInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const { error } = await getDb()
      .from("app_access_rules")
      .upsert(
        {
          app_key: data.app_key,
          scope: "department",
          scope_value: APP_DEFAULT_RULE_VALUE,
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
      target: `${data.app_key} · starting point`,
      detail: data.allow ? "everyone allowed" : "no one allowed until granted",
    });
    return { ok: true as const };
  });

export const deleteAccessRule = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const admin = await requireAdmin();
    const db = getDb();
    // Read it first so the activity log can say what was removed instead of
    // recording a bare UUID.
    const { data: rule } = await db
      .from("app_access_rules")
      .select("app_key,scope,scope_value")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await db.from("app_access_rules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    let target = data.id;
    if (rule) {
      let shownValue = rule.scope_value;
      if (rule.scope === "user") {
        const { data: person } = await db
          .from("users")
          .select("id_number")
          .eq("id", rule.scope_value)
          .maybeSingle();
        shownValue = person?.id_number ?? "removed account";
      }
      target = `${rule.app_key} · ${rule.scope}: ${shownValue}`;
    }
    await logActivity({
      action: "access.updated",
      actorId: admin.id,
      actorName: admin.label,
      actorNumber: admin.idNumber,
      target,
      detail: "rule removed",
    });
    return { ok: true as const };
  });

type OverviewPerson = {
  id: string;
  idNumber: string;
  name: string;
  department: string;
  position: string;
  isAdmin: boolean;
  apps: ReturnType<typeof resolveAccess>[];
};

type OverviewRule = {
  id: string;
  app_key: GrantableAppKey;
  scope: RuleScope;
  scope_value: string;
  allow: boolean;
};

/**
 * Everyone and every effective access, plus the explicit rules and each app's
 * starting point.
 *
 * The EFFECTIVE answer is computed server-side by the same `resolveAccess` the
 * route guards use. Recomputing precedence in the browser is how an admin
 * screen ends up confidently showing something the guards disagree with — so
 * this returns outcomes, not raw rules for the browser to interpret.
 *
 * The reserved starting-point rows are taken out of `rules` (they are not
 * real people, departments, or positions) and returned separately in
 * `defaults`.
 */
export const getAccessOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    people: OverviewPerson[];
    rules: OverviewRule[];
    defaults: Record<GrantableAppKey, boolean>;
    departments: string[];
    positions: string[];
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

    const rules = (rulesRes.data ?? []) as Array<{
      id: string;
      app_key: string;
      scope: string;
      scope_value: string;
      allow: boolean;
    }>;
    const visibleRules: OverviewRule[] = rules
      .filter((rule) => !isAppDefaultRule(rule))
      .map((rule) => ({
        id: rule.id,
        app_key: rule.app_key as GrantableAppKey,
        scope: rule.scope as RuleScope,
        scope_value: rule.scope_value,
        allow: rule.allow,
      }));

    const byAccount = new Map((profileRows ?? []).map((p) => [p.access_code_id, p] as const));

    const people: OverviewPerson[] = (usersRes.data ?? []).map((u) => {
      const profile = byAccount.get(u.id);
      const subject = {
        role: u.role as Role,
        userId: u.id,
        department: profile?.department ?? "",
        position: profile?.designation ?? "",
      };
      return {
        id: u.id,
        idNumber: u.id_number,
        name: profile?.full_name ?? "",
        department: subject.department,
        position: subject.position,
        isAdmin: u.role === "admin",
        apps: GRANTABLE_APP_KEYS.map((app) => resolveAccess(app, subject, rules)),
      };
    });
    // Blank names last: an unnamed account is still usable, but it should not
    // sit above real names in the By person list.
    people.sort((a, b) => (a.name || "\uffff").localeCompare(b.name || "\uffff"));

    // The values an admin can pick. Rules for a department or position that has
    // since emptied out are kept: removing one should still be possible.
    const departmentSet = new Set<string>();
    const positionSet = new Set<string>();
    for (const p of profileRows ?? []) {
      const dept = p.department ?? "";
      if (dept) departmentSet.add(dept);
      const pos = normalizePosition(p.designation ?? "");
      if (pos) positionSet.add(pos);
    }
    for (const rule of visibleRules) {
      if (rule.scope === "department") departmentSet.add(rule.scope_value);
      if (rule.scope === "position") positionSet.add(rule.scope_value);
    }

    const defaults = Object.fromEntries(
      GRANTABLE_APP_KEYS.map((app) => [app, defaultAccess(app, rules)]),
    ) as Record<GrantableAppKey, boolean>;

    return {
      people,
      rules: visibleRules,
      defaults,
      departments: [...departmentSet].sort((a, b) => a.localeCompare(b)),
      positions: [...positionSet].sort((a, b) => a.localeCompare(b)),
    };
  },
);

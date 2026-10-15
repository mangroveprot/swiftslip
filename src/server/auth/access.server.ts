/**
 * Which applications an account may open.
 *
 * Resolution order, first match wins:
 *   1. `role === "admin"`  -> every app. No rule is even read.
 *   2. a `user` rule for that app
 *   3. a `department` rule
 *   4. a `position` rule
 *   5. nothing matched     -> the staff default (SwiftSlip yes, Inventory no)
 *
 * WHY ADMINS BYPASS EVERYTHING
 *   Two reasons. A deny rule that applied to admins could strand everyone
 *   outside their own admin panel — the same failure the account service
 *   already guards against with its "keep at least one administrator" check.
 *   And whoever holds the Admin Panel already reaches every screen from it, so
 *   narrowing them buys no safety.
 *
 * WHY `scope_value` MATCHES IN CANONICAL FORM
 *   Department and Position are free text on the profile (`profiles.department` /
 *   `profiles.designation`) — there is no org directory to join against. A rule
 *   that misspells the value silently matches nobody, which is why the admin
 *   UI offers the values already in use rather than a blank text box.
 *
 *   Department scope values are matched as-is (just trimmed). Position scope
 *   values run through the POSITION_ALIASES map so an older spelling and its
 *   canonical form are the same rule as far as matching is concerned.
 */
import { normalizePosition } from "@/shared/org";
import { getDb } from "@/server/db/client.server";
import type { AppKey, GrantableAppKey, Role, RuleScope, SessionUser } from "@/shared/types";

import { requireUser } from "./session.server";

/** What a staff account gets before any rule is considered. */
const STAFF_DEFAULT: GrantableAppKey[] = ["swiftslip"];

const EVERY_APP: AppKey[] = ["admin", "swiftslip", "inventory"];

/** Scopes in the order they are consulted — most specific first. */
const SCOPE_ORDER: RuleScope[] = ["user", "department", "position"];

/**
 * The value a scope is compared by. User rules key on an id and need no
 * cleanup; department scope matches as-is; position scope folds in the
 * POSITION_ALIASES map (currently empty) so legacy spellings still match.
 */
function canonical(scope: RuleScope, value: string): string {
  if (scope === "position") return normalizePosition(value);
  return value.trim();
}

type Rule = {
  id?: string;
  app_key: string;
  scope: string;
  scope_value: string;
  allow: boolean;
};

/** What one (row, app) pair actually resolves to. */
export type AccessOutcome = {
  /** An administrator holds every app and cannot be restricted. */
  admin: boolean;
  allowed: boolean;
  /** True when a rule decided it; false when it fell through to the default. */
  byRule: boolean;
  /** Which scope produced the answer, for the admin UI to explain itself. */
  byScope: RuleScope | null;
  /**
   * The rule that produced this answer, so a caller can undo exactly it.
   * Carried here rather than looked up separately: the admin grid used to keep
   * a second query for the rule list, and if that was stale the "flip to
   * blocked" click silently re-applied "allowed" instead.
   */
  ruleId: string | null;
};

export type AccessSubject = {
  role: Role;
  userId?: string;
  department: string;
  position: string;
};

/**
 * The single source of truth for "does this subject get this app".
 *
 * Both the session resolver and the admin overview screen go through here —
 * duplicating the precedence order in the client is exactly how an app-access
 * grid ends up disagreeing with the route guards.
 */
export function resolveAccess(
  app: GrantableAppKey,
  subject: AccessSubject,
  rules: Rule[],
): AccessOutcome {
  if (subject.role === "admin") {
    return { admin: true, allowed: true, byRule: false, byScope: null, ruleId: null };
  }
  for (const scope of SCOPE_ORDER) {
    const wanted = canonical(
      scope,
      scope === "user"
        ? (subject.userId ?? "")
        : scope === "department"
          ? subject.department
          : subject.position,
    );
    // An empty profile value must never match a rule with an empty
    // scope_value, or a typo'd rule would grant every unset profile.
    if (!wanted) continue;
    const match = rules.find(
      (r) => r.app_key === app && r.scope === scope && canonical(scope, r.scope_value) === wanted,
    );
    // Most specific scope wins — never fall through to a broader one.
    if (match) {
      return {
        admin: false,
        allowed: match.allow,
        byRule: true,
        byScope: scope,
        ruleId: match.id ?? null,
      };
    }
  }
  const allowed = STAFF_DEFAULT.includes(app);
  return { admin: false, allowed, byRule: false, byScope: null, ruleId: null };
}

export async function resolveApps(user: SessionUser): Promise<AppKey[]> {
  if (user.role === "admin") return EVERY_APP;

  const db = getDb();
  const [rulesRes, profileRes] = await Promise.all([
    db.from("app_access_rules").select("app_key,scope,scope_value,allow"),
    db
      .from("profiles")
      .select("department,designation")
      .eq("access_code_id", user.id)
      .maybeSingle(),
  ]);

  // A database that has not run 0022 yet simply has no rules. Treat a missing
  // table as "no rules" rather than locking everyone out of the portal.
  const rules: Rule[] = rulesRes.error ? [] : ((rulesRes.data ?? []) as Rule[]);
  const subject: AccessSubject = {
    role: user.role,
    userId: user.id,
    department: profileRes.data?.department ?? "",
    position: profileRes.data?.designation ?? "",
  };

  const granted = (["swiftslip", "inventory"] as GrantableAppKey[]).filter(
    (app) => resolveAccess(app, subject, rules).allowed,
  );
  return [...granted];
}

/** True when this account may open `app`. Admins always pass. */
export async function canAccessApp(user: SessionUser, app: AppKey): Promise<boolean> {
  if (user.role === "admin") return true;
  const apps = await resolveApps(user);
  return apps.includes(app);
}

/**
 * Server-side guard for API calls, the real enforcement behind the route
 * guards. Every mutation and read of a grantable app goes through this.
 */
export async function requireApp(app: GrantableAppKey): Promise<SessionUser> {
  const user = await requireUser();
  const apps = await resolveApps(user);
  if (!apps.includes(app)) {
    throw new Error("You do not have access to this application.");
  }
  return user;
}

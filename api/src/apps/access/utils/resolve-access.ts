/**
 * Which applications an account may open — pure functions, no database.
 *
 * Resolution order, first match wins:
 *   1. `role === "admin"`  -> every app. No rule is even read.
 *   2. a `user` rule for that app
 *   3. a `department` rule
 *   4. a `position` rule
 *   5. nothing matched     -> the app's starting point (SwiftSlip and the
 *                             Ticketing System yes, Inventory no, until an
 *                             admin changes it)
 *
 * WHY ADMINS BYPASS EVERYTHING: a deny rule that applied to admins could strand
 * everyone outside their own admin panel, and whoever holds the Admin Panel
 * already reaches every screen from it.
 *
 * WHY THE STARTING POINT IS A RESERVED RULE: "everyone can open it / no one
 * until allowed" is per app. Rather than add a table for one boolean, it is a
 * department-scoped rule whose `scope_value` is the reserved string below. No
 * real profile can have that department, so it never matches a person; it is
 * read by `defaultAccess` and hidden from the admin rule lists.
 */
import { normalizePosition } from '@swiftslip/shared/org';
import type { GrantableAppKey, Role, RuleScope } from '@swiftslip/shared/types';

/**
 * What a staff account gets before any rule is considered.
 *
 * `ticketing` is here because everyone could already raise a ticket before it
 * became a managed app: turning it into a rule must not take the card away from
 * staff who had it yesterday. Blocking it is still one rule away.
 */
const STAFF_DEFAULT: GrantableAppKey[] = ['swiftslip', 'ticketing'];

/** Reserved `scope_value` that stores one app's starting point. */
export const APP_DEFAULT_RULE_VALUE = '__app_default__';

/** Scopes in the order they are consulted — most specific first. */
const SCOPE_ORDER: RuleScope[] = ['user', 'department', 'position'];

export type Rule = {
  id?: string;
  app_key: string;
  scope: string;
  scope_value: string;
  allow: boolean;
};

/** Position scope folds in the alias map; the rest just trims. */
function canonical(scope: RuleScope, value: string): string {
  if (scope === 'position') return normalizePosition(value);
  return value.trim();
}

/** True for the reserved row that stores an app's starting point. */
export function isAppDefaultRule(rule: {
  scope: string;
  scope_value: string;
}): boolean {
  return (
    rule.scope === 'department' && rule.scope_value === APP_DEFAULT_RULE_VALUE
  );
}

/** The answer before any person/department/position rule is applied. */
export function defaultAccess(app: GrantableAppKey, rules: Rule[]): boolean {
  const stored = rules.find(
    (rule) => rule.app_key === app && isAppDefaultRule(rule),
  );
  return stored ? stored.allow : STAFF_DEFAULT.includes(app);
}

export type AccessOutcome = {
  /** An administrator holds every app and cannot be restricted. */
  admin: boolean;
  allowed: boolean;
  /** True when a rule decided it; false when it fell through to the default. */
  byRule: boolean;
  /** Which scope produced the answer, for the admin UI to explain itself. */
  byScope: RuleScope | null;
  /** The rule that produced this answer, so a caller can undo exactly it. */
  ruleId: string | null;
};

export type AccessSubject = {
  role: Role;
  userId?: string;
  department: string;
  position: string;
};

/**
 * The single source of truth for "does this subject get this app". The
 * session resolver, the route guards and the admin overview all go through it.
 */
export function resolveAccess(
  app: GrantableAppKey,
  subject: AccessSubject,
  rules: Rule[],
): AccessOutcome {
  if (subject.role === 'admin') {
    return {
      admin: true,
      allowed: true,
      byRule: false,
      byScope: null,
      ruleId: null,
    };
  }
  for (const scope of SCOPE_ORDER) {
    const wanted = canonical(
      scope,
      scope === 'user'
        ? (subject.userId ?? '')
        : scope === 'department'
          ? subject.department
          : subject.position,
    );
    // An empty profile value must never match a rule with an empty
    // scope_value, or a typo'd rule would grant every unset profile.
    if (!wanted) continue;
    const match = rules.find(
      (r) =>
        r.app_key === app &&
        r.scope === scope &&
        canonical(scope, r.scope_value) === wanted,
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
  return {
    admin: false,
    allowed: defaultAccess(app, rules),
    byRule: false,
    byScope: null,
    ruleId: null,
  };
}

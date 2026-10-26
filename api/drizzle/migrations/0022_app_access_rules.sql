-- 0022 — Per-app access rules.
--
-- Which parts of the portal an account may open, decided by role first and then
-- by optional rules scoped to a single user, a Department or a Position.
--
-- WHAT THIS TABLE DELIBERATELY CANNOT DO
--   `app_key` is constrained to 'swiftslip' | 'inventory'. The Admin Panel is
--   NOT grantable: it stays gated on users.role = 'admin' alone, and admins
--   also bypass every rule below (see server/auth/access.server.ts). A rule
--   naming 'admin' would be dead configuration that silently does nothing,
--   so the CHECK makes that impossible rather than merely discouraged.
--
-- RESOLUTION ORDER (first match wins, most specific first):
--   1. role = 'admin'            -> every app, no rule is read
--   2. a `user` rule for that app
--   3. a `department` rule
--   4. a `position` rule
--   5. nothing matched             -> the staff default (SwiftSlip yes,
--                                     Asset Inventory no)
-- scope_value is compared verbatim against the employee's profile:
--   user       -> profiles.access_code_id (the users.id)
--   department -> profiles.area        (shown as "Department")
--   position   -> profiles.designation (shown as "Position")
-- Matching is exact and case-sensitive, so the spelling must match what is on
-- the profile.
--
-- `allow` exists so a broad grant can be carved back: "everyone in IT gets the
-- inventory, except these accounts" is only expressible with a deny rule.
--
-- ORDER: run after 0021_profile_supervisor.sql (independent, but numbered last).
-- The app treats a missing table as "no rules", so it is safe to deploy the
-- code before running this.

CREATE TABLE IF NOT EXISTS public.app_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL CHECK (app_key IN ('swiftslip', 'inventory')),
  -- 'user' | 'department' | 'position'
  scope text NOT NULL CHECK (scope IN ('user', 'department', 'position')),
  -- A users.id for 'user'; the literal profile text for the other two.
  scope_value text NOT NULL,
  allow boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS app_access_rules_unique_idx
  ON public.app_access_rules(app_key, scope, scope_value);
GRANT ALL ON public.app_access_rules TO service_role;
ALTER TABLE public.app_access_rules ENABLE ROW LEVEL SECURITY;
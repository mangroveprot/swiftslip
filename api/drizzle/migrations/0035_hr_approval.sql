-- 0035 — HR approval workflow for Official Business forms + in-app notifications.
--
-- WHAT THIS ADDS (see HR_APPROVAL_SPEC.md for the full decision record)
--   1. `hr` becomes a grantable app: the `app_access_rules` CHECK is widened
--      so a `hr` rule can be stored. Starting point is OFF (not in the staff
--      default); the API additionally auto-grants it to the HR Department.
--   2. Twelve HR-owned columns on `ob_forms` carrying the approval state:
--      who approved / signed, when, why rejected, and the departure/arrival
--      sign-off details. `hr_status` is plain text (no CHECK), so the workflow
--      can add `waiting_supervisor` without another migration. Existing rows
--      default to a `draft`, i.e. untouched.
--   3. A `notifications` table: one row per in-app bell event, scoped to a
--      recipient. RLS is ON with NO policies — the API's service-role key
--      bypasses RLS and scopes every read to the signed-in account itself.
--
-- STARTING POINT / AUTO-GRANT
--   `resolveAccess` still answers from explicit rules first; `resolveApps`
--   computes an automatic grant for department "HR Department" (or a position
--   filed under it) and applies it when no explicit rule matched. Admins keep
--   bypassing everything as before.
--
-- ORDER: run after 0034_dtr_other_attachments.sql (nothing here depends on it;
-- the number keeps the folder sequential). The code tolerates a missing
-- `notifications` table only as an error — run this before deploying.
--
-- APPLY BY HAND: paste this whole file into the Supabase SQL editor and run it.

-- ── 1. `hr` as a grantable app ───────────────────────────────────────────────

ALTER TABLE public.app_access_rules
  DROP CONSTRAINT IF EXISTS app_access_rules_app_key_check;

ALTER TABLE public.app_access_rules
  ADD CONSTRAINT app_access_rules_app_key_check
  CHECK (app_key IN ('swiftslip', 'inventory', 'ticketing', 'hr'));

-- ── 2. HR columns on ob_forms ────────────────────────────────────────────────

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS hr_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS hr_reject_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS hr_approved_by uuid REFERENCES public.profiles(access_code_id),
  ADD COLUMN IF NOT EXISTS hr_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS departure_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS departure_time text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS residence text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS destination text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS departure_signed_by uuid REFERENCES public.profiles(access_code_id),
  ADD COLUMN IF NOT EXISTS departure_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrival_signed_by uuid REFERENCES public.profiles(access_code_id),
  ADD COLUMN IF NOT EXISTS arrival_signed_at timestamptz;

-- ── 3. In-app notifications ──────────────────────────────────────────────────
--
-- `kind` is free text on purpose: the table stores a bell event, and the set
-- of kinds lives in shared/src/hr.ts where the UI labels them. `link` is a
-- relative path inside this app (/hr/ob/<id> or /official-business/<id>).

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- `profiles` has no `id` column: `access_code_id` is its primary key and the
  -- owning `users.id` — the same id the session carries.
  recipient_id uuid NOT NULL REFERENCES public.profiles(access_code_id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(access_code_id),
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  link text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: the API reads/writes with the service-role key
-- (which bypasses RLS) and scopes every query to the signed-in recipient.

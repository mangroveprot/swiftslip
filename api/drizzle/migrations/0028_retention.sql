-- 0028 — Data retention: the admin's auto-delete setting + a permanent record
-- of every cleanup run.
--
-- `retention_settings` holds exactly ONE row (id = true, enforced by the
-- CHECK). It says whether cleanup is switched on, how many days a form is
-- kept for, and which form types are in scope. Off by default, and nothing
-- runs on a schedule — cleanup only happens when an admin presses
-- "Run cleanup" in the Admin Panel (Settings → Data retention).
--
-- `cleanup_runs` is the PERMANENT history of those runs: the activity log
-- prunes itself after 30 days, so this table is what stays — who ran it, with
-- what settings, and how many forms and files went away, per type.
--
-- Both tables follow activity_logs: RLS enabled with no policies, written
-- only by the app through the service role (PostgREST's other roles can
-- neither read nor write them).
--
-- ORDER: run after 0027_app_access_ticketing.sql, in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.retention_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  -- Any period from a single day up: the office picks the number, not the
  -- app. 365 is only the suggested starting point. Zero is refused because
  -- it would mean "everything older than right now".
  days int NOT NULL DEFAULT 365 CHECK (days >= 1),
  -- Text list of the chosen types, e.g. '["ob","loa"]' — empty by default.
  form_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;

-- Seed the single row so a fresh install has something to read.
INSERT INTO public.retention_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  -- Who pressed the button (plain text like activity_logs — no foreign key,
  -- so the history survives the account being removed).
  ran_by_id text,
  ran_by_name text,
  ran_by_number text,
  days int NOT NULL,
  form_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Per-type counts, e.g. '{"ob":12,"loa":3}'. Sparse: a type with nothing
  -- deleted has no key.
  forms_deleted jsonb NOT NULL DEFAULT '{}'::jsonb,
  files_deleted jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'completed', or 'completed_with_file_errors' when a storage removal
  -- failed after the rows were already gone (files become orphans then).
  status text NOT NULL DEFAULT 'completed'
);

CREATE INDEX IF NOT EXISTS cleanup_runs_ran_at_idx
  ON public.cleanup_runs (ran_at DESC);

ALTER TABLE public.cleanup_runs ENABLE ROW LEVEL SECURITY;

-- If an earlier draft of this file was already applied (it capped the period
-- at 30 days), run 0029_retention_days_floor.sql once to lift that floor.
-- It is a no-op on a database that only ever ran this version.

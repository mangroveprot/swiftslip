-- 0031 — Storage: which backend takes new uploads, and where each file lives.
--
-- Uploaded files can now live in Supabase Storage or in Backblaze B2. Two
-- things have to be stored for that to work, and nothing else:
--
--   1. storage_settings — ONE row: the admin's upload rule (Settings → Storage).
--   2. attachment_backend — on every table that keeps an `attachment_path`, a
--      marker saying which backend that path belongs to. This schema has no
--      central `files` table (each form row keeps its own path), so the marker
--      sits right next to the path it qualifies.
--
-- THE RULE
--   'supabase-first'  new files go to Supabase until its free space falls to
--                     min_free_percent of the plan limit, then to B2.
--   'b2-only'         every new file goes to B2.
--   'supabase-only'   every new file goes to Supabase.
--   The default is 10 free, i.e. switch to B2 when Supabase is 90% full.
--   Files already stored never move when the rule changes.
--
-- EXISTING ROWS
--   Every file uploaded before this migration is in Supabase, so the new
--   column defaults to 'supabase' and no backfill is needed.
--
-- OTHER ATTACHMENTS
--   loa_forms and ot_forms also keep `other_attachments`, a jsonb list of
--   { path, name }. Nothing changes in SQL for them: new entries carry a
--   "backend" key, and an entry without one means 'supabase'.
--
-- Like activity_logs, RLS is enabled with no policies: only the app, through
-- the service role, reads or writes storage_settings.
--
-- ORDER: run after the previous migration (0030), in the Supabase SQL editor.
-- Code that reads storage_settings should fall back to the defaults above when
-- the table is missing (as app_access_rules does), so it is safe to deploy the
-- code before this runs.

CREATE TABLE IF NOT EXISTS public.storage_settings (
  -- Always true: as the primary key, it caps the table at a single row.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  rule text NOT NULL DEFAULT 'supabase-first'
    CHECK (rule IN ('supabase-first', 'b2-only', 'supabase-only')),
  -- Only read under 'supabase-first'.
  min_free_percent integer NOT NULL DEFAULT 10
    CHECK (min_free_percent BETWEEN 1 AND 50),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_id text,
  updated_by_name text
);

ALTER TABLE public.storage_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.storage_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dtr_records
  ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2'));

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2'));

ALTER TABLE public.loa_forms
  ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2'));

ALTER TABLE public.cos_forms
  ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2'));

ALTER TABLE public.ot_forms
  ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2'));
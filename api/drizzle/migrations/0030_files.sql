-- 0030 — Optional B2 file storage (future features).
--
-- One row per object uploaded through /api/files — the Backblaze B2 backend
-- described in STORAGE_GUIDE.md. The existing form attachments keep using
-- Supabase Storage and do NOT use this table; nothing here changes them.
--
-- `key` is the object key in the B2 bucket (e.g. 9f1c....pdf), NEVER a full
-- URL: build the download link at request time (a 5-minute presigned GET).
--
-- No foreign key on owner_id on purpose. Account deletion removes the user row
-- FIRST, then cleans storage (same order as the Supabase folders); keeping the
-- file rows until that cleanup runs is what lets it find the objects. This
-- mirrors activity_logs, whose history also survives the account. RLS is on
-- with no policies: only the API's service-role key can read or write.
--
-- ORDER: run after 0029_retention_days_floor.sql, in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  -- What the user saw when they picked the file; display only.
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  owner_id text NOT NULL,
  -- Optional labels for the feature that keeps this key (e.g. 'avatar', '42').
  entity_type text,
  entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS files_owner_id_created_at_idx
  ON public.files (owner_id, created_at DESC);

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

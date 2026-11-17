-- 0043 — Database backup to Google Drive (Admin Panel → Settings → Backup).
--
-- The database is the only thing that cannot be rebuilt: every attachment path,
-- form row and account lives in it, and a Supabase free project has no backups
-- of its own. The attachments are gigabytes sitting in Supabase Storage and
-- Backblaze B2 — far too much to push through a small host on a schedule — so
-- this feature backs up the DATABASE ONLY and says so on the page.
--
-- Two tables, both single-tenant admin data like storage_settings:
--
--   backup_settings  ONE row: the Drive connection, the retention count, and
--                    the secret that makes the cron link work.
--   backup_runs      one row per dump, kept forever so the page can show a
--                    history (and so a silent failure is visible later).
--
-- THE DRIVE CONNECTION
--   refresh_token is the OAuth refresh token, already sealed by the API with
--   AES-256-GCM (key derived from SESSION_SECRET) before it lands here. A leaked
--   table therefore cannot be replayed against Google, and rotating
--   SESSION_SECRET simply makes the admin reconnect.
--
-- THE CRON LINK
--   cron_token is the bearer half of
--     GET /api/backup/cron/<token>
--   It is stored in clear on purpose: the whole point of the setting is a link
--   the admin can copy again next month, which a hash could not do. It only
--   ever triggers a backup (no read, no delete, no settings), it is
--   rate-limited, and "Regenerate" replaces it in one click.
--
-- ORDER: run after 0042_sessions.sql, in the Supabase SQL editor, BEFORE
-- deploying the code that reads it (unlike storage_settings there is no
-- in-code fallback: the Backup page needs both tables to exist).

CREATE TABLE IF NOT EXISTS public.backup_settings (
  -- Always true: as the primary key, it caps the table at a single row.
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Off until the admin turns it on. When off the cron link refuses to run;
  -- "Back up now" still works, so a first manual dump is always possible.
  enabled boolean NOT NULL DEFAULT false,
  -- Google OAuth, sealed by the API. NULL = never connected / disconnected.
  refresh_token text,
  account_email text,
  connected_at timestamptz,
  -- Folder the dumps land in, created on first connect.
  folder_id text,
  folder_name text NOT NULL DEFAULT 'SwiftSlip Backups',
  -- How many dumps Drive keeps; the oldest are deleted after a successful run.
  keep_count integer NOT NULL DEFAULT 14
    CHECK (keep_count BETWEEN 1 AND 90),
  -- Bearer half of the cron link (see above).
  cron_token text,
  -- Single-use OAuth state, cleared by the callback.
  oauth_state text,
  oauth_state_at timestamptz,
  last_run_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_id text,
  updated_by_name text
);

CREATE TABLE IF NOT EXISTS public.backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  -- `triggered_by`, not `trigger`: TRIGGER is a PostgreSQL keyword.
  triggered_by text NOT NULL DEFAULT 'manual'
    CHECK (triggered_by IN ('manual', 'cron')),
  -- Size of the gzipped dump that reached Drive (NULL until it does).
  size_bytes bigint,
  file_id text,
  file_name text,
  -- Plain-English failure, safe to show on the page.
  error text,
  actor_id text,
  actor_name text
);

CREATE INDEX IF NOT EXISTS backup_runs_started_at_idx
  ON public.backup_runs (started_at DESC);

GRANT ALL ON public.backup_settings TO service_role;
GRANT ALL ON public.backup_runs TO service_role;

-- Service role only, like every other table: RLS is on with no policies.
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_runs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.backup_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

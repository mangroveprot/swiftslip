-- 0044 — one backup run, one dump per database.
--
-- The Backup page used to dump a single database (SwiftSlip's). It now dumps
-- every database that has a connection string in the environment, in one run:
-- the SwiftSlip project (SUPABASE_DB_URL) and the RGC inventory database
-- (RGC_INVENTORY_DATABASE_URL, which the stock pages already use). Each dump
-- gets its own row so a failure on one does not hide the success of the other,
-- which is what this column is for.
--
-- Additive and safe to re-run. Existing rows keep NULL: before this migration
-- every row was a SwiftSlip dump, and the page labels NULL rows that way.
--
-- ORDER: run after 0043_backup.sql, in the Supabase SQL editor, BEFORE
-- deploying the code that writes this column.

ALTER TABLE public.backup_runs ADD COLUMN IF NOT EXISTS target text;

-- The page reads the newest rows once per paint; the target makes the history
-- readable per database, and the sweep counts per prefix in Drive.
CREATE INDEX IF NOT EXISTS backup_runs_target_idx
  ON public.backup_runs (target, started_at DESC);

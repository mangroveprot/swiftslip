-- 0029 — Data retention: lift the old 30-day floor on the keep period.
--
-- 0028 was first applied with `CHECK (days >= 30)`. The office picks its own
-- period now (1 day, 7, 400 — their call), so saving anything smaller fails
-- with:
--
--   new row for relation "retention_settings" violates check constraint
--   "retention_settings_days_check"
--
-- This repair drops whatever check currently guards `days` and replaces it
-- with `days >= 1` (0 would mean "everything older than right now").
--
-- Safe to run more than once, and safe on a database that already has the
-- newer `>= 1` version of 0028: it just drops and re-adds the same rule.
--
-- ORDER: run after 0028_retention.sql.

DO $$
DECLARE
  -- Collected first: the loop below alters the table, and scanning
  -- pg_constraint while dropping constraints from it is asking for trouble.
  guarded_by text[];
  constraint_name text;
BEGIN
  IF to_regclass('public.retention_settings') IS NULL THEN
    RAISE NOTICE 'retention_settings is missing — run 0028_retention.sql first.';
    RETURN;
  END IF;

  -- Every CHECK on this table whose definition mentions `days`, whatever it
  -- happens to be called. The single-row guard (`id = true`) is untouched.
  SELECT array_agg(c.conname) INTO guarded_by
  FROM pg_constraint c
  WHERE c.conrelid = 'public.retention_settings'::regclass
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%days%';

  FOREACH constraint_name IN ARRAY coalesce(guarded_by, '{}') LOOP
    EXECUTE format(
      'ALTER TABLE public.retention_settings DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;

  ALTER TABLE public.retention_settings
    ADD CONSTRAINT retention_settings_days_check CHECK (days >= 1);
END $$;

-- PostgREST normally notices DDL on its own; this makes the reload immediate.
NOTIFY pgrst, 'reload schema';

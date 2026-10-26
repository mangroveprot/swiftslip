-- 0026 — Repair: make sure the COS schedule time columns exist.
--
-- 0017_cos_schedule_times.sql introduced from_date / from_start / from_end /
-- to_date / to_start / to_end, but that file was never applied to the live
-- project even though the app already reads the new columns. Every COS list
-- (and every COS editor open) therefore failed with:
--
--   Could not find the 'from_date' column of 'cos_schedules' in the schema cache
--
-- This repair migration is safe to run on either shape of the table:
--   * 0016 shape (schedule_from / schedule_to): the new columns are added, the
--     date half of each old "MM/DD/YYYY - ..." line is carried across, then the
--     superseded columns are dropped.
--   * 0017 shape: every statement is a no-op.
--
-- ORDER: run after 0025_org_designation_options.sql.

ALTER TABLE public.cos_schedules
  ADD COLUMN IF NOT EXISTS from_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS from_start text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS from_end text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS to_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS to_start text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS to_end text NOT NULL DEFAULT '';

DO $$
BEGIN
  -- Only touch the legacy columns when they are still there, so re-running this
  -- file (or running it after 0017 was applied by hand) never errors.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cos_schedules'
      AND column_name = 'schedule_from'
  ) THEN
    UPDATE public.cos_schedules
    SET from_date = to_char(
      to_date(split_part(schedule_from, ' - ', 1), 'MM/DD/YYYY'),
      'YYYY-MM-DD'
    )
    WHERE schedule_from ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cos_schedules'
      AND column_name = 'schedule_to'
  ) THEN
    UPDATE public.cos_schedules
    SET to_date = to_char(
      to_date(split_part(schedule_to, ' - ', 1), 'MM/DD/YYYY'),
      'YYYY-MM-DD'
    )
    WHERE schedule_to ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}';
  END IF;

  ALTER TABLE public.cos_schedules
    DROP COLUMN IF EXISTS schedule_from,
    DROP COLUMN IF EXISTS schedule_to;
END $$;

-- PostgREST normally notices DDL on its own; this makes the reload immediate.
NOTIFY pgrst, 'reload schema';

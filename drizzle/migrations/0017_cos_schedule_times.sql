-- 0017 — COS schedule lines: capture the date and the shift hours properly.
--
-- 0016 stored each line's FROM / TO as free text ("10/07/2026 - 8am - 5pm").
-- The editor now uses a calendar and time pickers, so the parts are stored as
-- they are picked and composed into the printed line when it is rendered.
--
-- ORDER: run after 0016_cos_schedules.sql.

ALTER TABLE public.cos_schedules
  ADD COLUMN IF NOT EXISTS from_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS from_start text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS from_end text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS to_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS to_start text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS to_end text NOT NULL DEFAULT '';

-- Best effort: carry the date half of any line already typed as
-- "MM/DD/YYYY - ..." across to the new column, converted to the YYYY-MM-DD the
-- date input expects. The hours in those old strings are free text ("8am"), so
-- they are not guessed at — only the unambiguous date part is kept.
UPDATE public.cos_schedules
SET from_date = to_char(to_date(split_part(schedule_from, ' - ', 1), 'MM/DD/YYYY'), 'YYYY-MM-DD')
WHERE schedule_from ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}';

UPDATE public.cos_schedules
SET to_date = to_char(to_date(split_part(schedule_to, ' - ', 1), 'MM/DD/YYYY'), 'YYYY-MM-DD')
WHERE schedule_to ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}';

ALTER TABLE public.cos_schedules
  DROP COLUMN IF EXISTS schedule_from,
  DROP COLUMN IF EXISTS schedule_to;

-- 0016 — Change of Schedule (COS): one row per schedule line.
--
-- 0015 gave cos_forms a single fixed schedule (effectivity_date /
-- schedule_from / schedule_to). A change of schedule can cover more than one
-- date, so the schedule becomes a child table — exactly the way ob_entries
-- backs ob_forms.
--
-- ORDER: run after 0015_cos_forms.sql (already applied).

CREATE TABLE IF NOT EXISTS public.cos_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.cos_forms(id) ON DELETE CASCADE,
  idx int NOT NULL,
  effectivity_date text NOT NULL DEFAULT '',
  schedule_from text NOT NULL DEFAULT '',
  schedule_to text NOT NULL DEFAULT '',
  UNIQUE (form_id, idx)
);
GRANT ALL ON public.cos_schedules TO service_role;
ALTER TABLE public.cos_schedules ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cos_schedules_form_id_idx ON public.cos_schedules(form_id);

-- The single-line columns are superseded by the child table. Any line already
-- stored on a form is carried over as its first schedule row BEFORE the drop,
-- so nothing that has already been filled in is lost.
INSERT INTO public.cos_schedules (form_id, idx, effectivity_date, schedule_from, schedule_to)
SELECT id, 0, effectivity_date, schedule_from, schedule_to
FROM public.cos_forms
WHERE coalesce(btrim(effectivity_date), '') <> ''
   OR coalesce(btrim(schedule_from), '') <> ''
   OR coalesce(btrim(schedule_to), '') <> '';

ALTER TABLE public.cos_forms
  DROP COLUMN IF EXISTS effectivity_date,
  DROP COLUMN IF EXISTS schedule_from,
  DROP COLUMN IF EXISTS schedule_to;

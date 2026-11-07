-- 0037 — say out loud when an Official Business form is a RESUBMIT.
--
-- WHAT THIS ADDS
--   The workflow already knew: a rejected form that comes back, and content
--   edited after HR approval, both re-enter the queue with an
--   `ob_resubmitted` notification. Nothing on the ROW remembered it — once HR
--   cleared the reject reason the form looked like a first submission, so the
--   queue, the detail page and the employee's own status card all had nothing
--   to badge and no history to show.
--
--     resubmit_count    how many times the form has gone back to HR
--     resubmit_history  the trips themselves, oldest first — when it went
--                       back, why (`rejected` / `edited`), and HR's rejection
--                       reason AT THE TIME. The live `hr_reject_reason` column
--                       is cleared on the next submit, so this array is what
--                       keeps "what was actually fixed" readable.
--
-- APPLY BY HAND: paste this whole file into the Supabase SQL editor and run it.

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS resubmit_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resubmit_history jsonb NOT NULL DEFAULT '[]';

-- One-time backfill for rows that predate this: every resubmission wrote an
-- `ob_resubmitted` notification carrying the exact moment, so the COUNT comes
-- from the workflow's own record rather than being guessed from `updated_at`.
-- The history stays empty for those rows — we know how many, not the reasons
-- — and the cards show the count alone until a new resubmit fills it in.
-- Only rows still at 0 are touched, so re-running is a no-op.

UPDATE public.ob_forms f
   SET resubmit_count = (
         SELECT COUNT(*)
           FROM public.notifications n
          WHERE n.kind = 'ob_resubmitted'
            AND n.link = '/hr/ob/' || f.id::text
       )
 WHERE f.resubmit_count = 0
   AND EXISTS (
         SELECT 1
           FROM public.notifications n
          WHERE n.kind = 'ob_resubmitted'
            AND n.link = '/hr/ob/' || f.id::text
       );

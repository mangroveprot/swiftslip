-- 0036 — keep the arrival date/time HR types when signing an OB back in.
--
-- WHAT THIS ADDS (see HR_APPROVAL_SPEC.md §4 for the sign-off columns)
--   The departure row already stores the date/time HR entered (`departure_date`
--   / `departure_time`). The arrival row only stored the audit timestamp
--   (`arrival_signed_at`), so the exit-clearance box on the printed OB form had
--   nothing to show for "Date / Time of Actual Arrival". These two columns keep
--   exactly what HR typed, separate from when the API recorded the signature.
--
-- Existing completed rows default to '' — the UI falls back to
-- `arrival_signed_at` so their arrival boxes still fill.
--
-- APPLY BY HAND: paste this whole file into the Supabase SQL editor and run it.

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS arrival_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS arrival_time text NOT NULL DEFAULT '';

-- ── Status-card timestamps / actors ──────────────────────────────────────────
--
-- WHAT THIS ADDS
--   The OB status cards print four facts the workflow already implied but did
--   not store: when the employee handed the form over (`submitted_at`, stamped
--   again on every resubmit), when and by whom HR bounced it back
--   (`hr_rejected_at` / `hr_rejected_by`, cleared together with the reason on
--   the next submit), and when the supervisor's approval slip was ticked
--   (`supervisor_approved_at`, stamped only on the false → true transition).
--   All four are nullable — a fresh row, or one that never reached that step,
--   simply has NULL there. `hr_rejected_by` is the same account id shape as
--   `hr_approved_by` (migration 0035).

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS hr_rejected_by uuid REFERENCES public.profiles(access_code_id),
  ADD COLUMN IF NOT EXISTS supervisor_approved_at timestamptz;

-- One-time backfill for rows that predate these columns — taken from the
-- workflow's own record rather than guessed from `updated_at`. Every submission
-- wrote an `ob_submitted` / `ob_resubmitted` notification and every rejection an
-- `ob_rejected` one, each carrying the exact moment and the person who did it,
-- so the historical rows get their real stamps. Where no notification survives,
-- the column stays NULL and the card prints "—" instead of a wrong date.
--
-- `supervisor_approved_at` has no such record (the employee just ticks the
-- approval slip), so old rows keep NULL and the card simply omits that note —
-- a missing time is better than an invented one on an approval record.
--
-- Both statements only fill a NULL and take the LATEST matching notification,
-- so re-running them is a no-op and a resubmit/reject cycle keeps its most
-- recent moment.

UPDATE public.ob_forms f
   SET submitted_at = (
         SELECT MAX(n.created_at)
           FROM public.notifications n
          WHERE n.kind IN ('ob_submitted', 'ob_resubmitted')
            AND n.link = '/hr/ob/' || f.id::text
       )
 WHERE f.submitted_at IS NULL
   AND f.hr_status <> 'draft'
   AND EXISTS (
         SELECT 1
           FROM public.notifications n
          WHERE n.kind IN ('ob_submitted', 'ob_resubmitted')
            AND n.link = '/hr/ob/' || f.id::text
       );

UPDATE public.ob_forms f
   SET hr_rejected_at = (
         SELECT MAX(n.created_at)
           FROM public.notifications n
          WHERE n.kind = 'ob_rejected'
            AND n.link = '/official-business/' || f.id::text
       ),
       hr_rejected_by = (
         SELECT n.actor_id
           FROM public.notifications n
          WHERE n.kind = 'ob_rejected'
            AND n.link = '/official-business/' || f.id::text
       ORDER BY n.created_at DESC
          LIMIT 1
       )
 WHERE f.hr_rejected_at IS NULL
   AND f.hr_status = 'rejected'
   AND EXISTS (
         SELECT 1
           FROM public.notifications n
          WHERE n.kind = 'ob_rejected'
            AND n.link = '/official-business/' || f.id::text
       );

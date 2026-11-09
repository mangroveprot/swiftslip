-- 0039 — hold post-approval edits as a DRAFT instead of auto-resubmitting.
--
-- WHY
--   Until now a save on an approved / departed / completed form immediately
--   rewrote the live row, reset `hr_status` to `submitted` and cleared HR's
--   sign-offs. One keystroke on an approved form put it back in HR's queue, and
--   HR lost the version it had approved. The employee had no chance to review
--   the edit first and no way to take it back.
--
--   Now the live row is ALWAYS the version HR last reviewed. An edit after
--   approval is stored in `pending_content` and the status does not change;
--   HR's queue keeps showing the approved form. The employee presses
--   "Resubmit to HR" when the draft is ready. The API then moves the draft onto
--   the live row, stashes the approved version in `previous_content` and puts
--   the form back in the queue. Cancelling that resubmission puts
--   `previous_content` back, returns the status and HR sign-offs, and keeps the
--   employee's text in `pending_content` as a draft again — so nothing typed is
--   lost and HR gets exactly the approved version back.
--
-- WHAT THIS ADDS
--   pending_content  jsonb NULL
--     `{ form: { …employee header fields… }, entries: [ …itinerary cells… ] }`
--     The employee's unsent edit. NULL when there is no draft. Written only for
--     approved / departed / completed / waiting-for-supervisor forms; a draft or
--     rejected form still saves straight to the live row.
--
--   previous_content jsonb NULL
--     The same shape, holding the version HR approved while an edited
--     resubmission waits in the queue. NULL outside that window.
--
--   resubmit_history gains optional `from_status`, `previous_submitted_at` and
--   `hr` (HR's sign-off columns at resubmit time) on `edited` events. They are
--   what a cancel restores. Existing rows need no backfill: without them the
--   cancel action simply is not offered for that old event.
--
-- APPLY BY HAND: paste this whole file into the Supabase SQL editor and run it.

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS pending_content jsonb,
  ADD COLUMN IF NOT EXISTS previous_content jsonb;

-- 0038 — remember the version HR last reviewed, so a resubmit can say WHAT
-- changed (and what it was before).
--
-- WHY
--   0037 records that a form came back (`resubmit_count` / `resubmit_history`)
--   and the rejection reason, but not the content. "Changed since: Purpose,
--   Destination" and the HR sheet's "Changed / Was: …" notes need a baseline.
--   Storing the previously submitted content here is cheaper and safer than a
--   full version table: one snapshot per form, replaced on every submit.
--
-- WHAT THIS ADDS
--   submit_snapshot jsonb NULL
--     `{ form: { …editable header text… }, entries: [ …itinerary cells… ] }`,
--     written by the API at submit time and diffed on the next resubmit.
--     NULL for rows submitted before this migration — those show the count but
--     no field-level changes rather than a false "everything changed".
--
-- APPLY BY HAND: paste this whole file into the Supabase SQL editor and run it.

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS submit_snapshot jsonb;

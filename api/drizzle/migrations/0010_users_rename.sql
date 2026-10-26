-- 0010 — drop the free-text sidebar label and rename access_codes → users.
--
-- The label was the last trace of the old SwiftSlip password list: user
-- management shows the profile's full name instead, and sign-in now builds
-- the "Signed in as …" name from profiles.full_name (falling back to the ID
-- number). Everything else about an account — unique ID number, password,
-- role, timestamps — is unchanged.
--
-- Nothing else in SQL needs updating: grants, enabled RLS and the foreign
-- keys from profiles / dtr_records / ob_forms all follow the rename. The
-- application code must be deployed together with this migration (it now
-- addresses the table as `users`).
--
-- ORDER: run after 0007_account_id_number.sql (0007 still backfills from
-- label). Run in the Supabase SQL editor, with 0008/0009 before this one.

ALTER TABLE public.access_codes DROP COLUMN IF EXISTS label;

ALTER TABLE public.access_codes RENAME TO users;

ALTER INDEX IF EXISTS public.access_codes_id_number_key
  RENAME TO users_id_number_key;

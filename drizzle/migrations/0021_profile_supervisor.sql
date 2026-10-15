-- 0021 — Supervisor / Department Head on the profile.
--
-- The approver most forms need is the same person every time: the employee's
-- Supervisor / Department Head. Storing it once on the profile means a new DTR
-- record / OB / LOA / COS / OT form can pre-fill its approver field instead of
-- asking for the same name every time.
--
-- Only the PROFILE gains a column. The forms already have their own approver
-- columns (`dtr_records.certified_by`, and `approved_by` on the OB / LOA / COS /
-- OT tables) and keep their own editable copy — the profile is just the
-- auto-fill source, exactly like `signature` in 0012.
--
-- ORDER: run after 0012_profile_signature.sql.
-- The app degrades gracefully if this has not been run: getProfile/saveProfile
-- retry without `supervisor`, so the field simply reads empty until it is.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supervisor text NOT NULL DEFAULT '';
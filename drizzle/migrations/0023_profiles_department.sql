-- 0023 — Department on the profile.
--
-- A Position sits under a Department (IT Support / IT Programmer under
-- Information Technology, Field Monitoring under Operations). Until now the
-- department was only derived from the position in code; storing it lets an
-- account keep its department even when the position is typed under "Others",
-- and lets the OB / LOA / OT forms print the department the employee actually
-- belongs to instead of the office branch.
--
-- Existing rows are backfilled from the position→department map in
-- src/shared/org.ts (POSITION_DEPARTMENTS). Keep those values in sync.
--
-- ORDER: run after 0021_profile_supervisor.sql.
-- The app degrades gracefully if this has not been run: getProfile/saveProfile
-- and listAccessCodes retry without `department`, so the field simply reads
-- empty until it is.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department text NOT NULL DEFAULT '';

-- Backfill from the fixed position list (same values as POSITION_DEPARTMENTS).
UPDATE public.profiles
  SET department = 'Information Technology'
  WHERE designation IN ('IT Support', 'IT Programmer') AND department = '';

UPDATE public.profiles
  SET department = 'Operations'
  WHERE designation = 'Field Monitoring' AND department = '';

-- 0041 — Employer on the profile, stored as a smallint code.
--
-- 0 = Regasco, 1 = Mindbridge. A number is unambiguous in the database and in
-- the API; the frontend converts it to the company name with the shared helpers
-- `employerLabel()` / `employerCode()` in `shared/src/org.ts`.
--
-- Every account that exists when this runs belongs to Mindbridge (1). The
-- default is 1 too, so a profile created without an employer also starts there.
--
-- ORDER: run after 0040_liq_forms.sql.

-- Fresh install: add the numeric column with the Mindbridge default. Existing
-- rows are filled with the default as part of the ADD COLUMN.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employer smallint NOT NULL DEFAULT 1;

-- Repair path: if an earlier draft of this migration created `employer` as
-- text, convert it in place (blank / unknown / "Mindbridge" → 1,
-- "Regasco" / "0" → 0) instead of failing on the CHECK below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'employer'
      AND data_type <> 'smallint'
  ) THEN
    ALTER TABLE public.profiles ALTER COLUMN employer DROP DEFAULT;
    ALTER TABLE public.profiles ALTER COLUMN employer TYPE smallint
      USING CASE lower(employer::text)
        WHEN 'regasco' THEN 0
        WHEN '0' THEN 0
        ELSE 1
      END;
  END IF;
END $$;

ALTER TABLE public.profiles
  ALTER COLUMN employer SET DEFAULT 1,
  ALTER COLUMN employer SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_employer_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_employer_check CHECK (employer IN (0, 1));

-- One-time backfill requested by the owner: every current account is
-- Mindbridge. New rows use the column default above.
UPDATE public.profiles SET employer = 1;

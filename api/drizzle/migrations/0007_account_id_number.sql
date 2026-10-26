-- Accounts gain a UNIQUE id_number, and signing in becomes ID number + password
-- (instead of looking up an account by the password hash alone).
--
-- Backfill so every existing account can sign in as soon as this runs:
--   1. prefer the employee's profile emp_no (the real ID number), then
--   2. fall back to the old display label.
-- Duplicate values get a -2/-3 suffix so the unique index always succeeds.

ALTER TABLE public.access_codes
  ADD COLUMN IF NOT EXISTS id_number text;

UPDATE public.access_codes ac
SET id_number = NULLIF(btrim(p.emp_no), '')
FROM public.profiles p
WHERE p.access_code_id = ac.id
  AND coalesce(btrim(ac.id_number), '') = ''
  AND coalesce(btrim(p.emp_no), '') <> '';

UPDATE public.access_codes
SET id_number = btrim(label)
WHERE coalesce(btrim(id_number), '') = '';

-- De-duplicate (case-insensitive) — later rows get a numeric suffix.
WITH dupes AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY lower(btrim(id_number))
           ORDER BY created_at, id
         ) AS rn
  FROM public.access_codes
  WHERE coalesce(btrim(id_number), '') <> ''
)
UPDATE public.access_codes ac
SET id_number = btrim(ac.id_number) || '-' || d.rn
FROM dupes d
WHERE d.id = ac.id
  AND d.rn > 1;

ALTER TABLE public.access_codes
  ALTER COLUMN id_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS access_codes_id_number_key
  ON public.access_codes (id_number);

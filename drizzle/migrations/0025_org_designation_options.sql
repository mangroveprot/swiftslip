-- 0025 — Admin-editable Designation list.
--
-- Same idea as 0024: the Designation picker (the office / branch an account
-- works at, stored on `profiles.area`) was backed by a fixed constant in
-- src/shared/org.ts. This table replaces that, so the admin UI can carry
-- rename / delete buttons on each row of the picker.
--
-- Seeded from DESIGNATIONS so nothing changes on screen until someone edits a
-- row. A rename cascades to `profiles.area`; Designation is NOT an access-rule
-- scope (only user / department / position are), so no rule rows are touched.
--
-- ORDER: run after 0024_org_option_lists.sql.

CREATE TABLE IF NOT EXISTS public.org_designations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed from DESIGNATIONS in src/shared/org.ts.
INSERT INTO org_designations (value) VALUES
  ('RGC Dipolog Sat Office'),
  ('RGC Dipolog Satellite')
ON CONFLICT (value) DO NOTHING;
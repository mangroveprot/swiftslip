-- 0024 — Admin-editable Department and Position lists.
--
-- The Department and Position pickers in user management / My Account were
-- backed by fixed constants in src/shared/org.ts. These two tables replace
-- that: the server reads them (falling back to the constants when a table is
-- missing or empty), and the admin UI gets pencil / trash buttons next to
-- each picker so the lists can be maintained without a code change.
--
-- Seeded from the current DEPARTMENT_POSITIONS map so nothing changes on
-- screen until someone edits a row.
--
-- ORDER: run after 0023_profiles_department.sql.

CREATE TABLE IF NOT EXISTS public.org_departments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_positions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  value text NOT NULL UNIQUE,
  -- The department this position sits under ("IT Support" → "Information
  -- Technology"). Empty for an off-list position typed under "Others".
  department text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed from DEPARTMENT_POSITIONS in src/shared/org.ts.
INSERT INTO org_departments (value) VALUES
  ('Information Technology'),
  ('Operations')
ON CONFLICT (value) DO NOTHING;

INSERT INTO org_positions (value, department) VALUES
  ('IT Support', 'Information Technology'),
  ('IT Programmer', 'Information Technology'),
  ('Field Monitoring', 'Operations')
ON CONFLICT (value) DO NOTHING;

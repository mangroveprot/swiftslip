-- Per-user employee profile (1:1 with access_codes) + own-records ownership.

CREATE TABLE IF NOT EXISTS public.profiles (
  access_code_id uuid PRIMARY KEY REFERENCES public.access_codes(id) ON DELETE CASCADE,
  emp_no text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.dtr_records
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES public.access_codes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS dtr_records_owner_id_idx ON public.dtr_records(owner_id);

CREATE TABLE IF NOT EXISTS public.access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','user')),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.access_codes TO service_role;
ALTER TABLE public.access_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dtr_template (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title text NOT NULL DEFAULT 'DAILY TIME RECORD',
  org_name text NOT NULL DEFAULT '',
  employee_signature_label text NOT NULL DEFAULT 'Employee''s Signature Over Printed Name',
  certified_by_label text NOT NULL DEFAULT 'Certified by:',
  certifier_signature_label text NOT NULL DEFAULT 'Signature Over Printed Name / Position',
  default_schedule text NOT NULL DEFAULT '8:00 AM - 5:00 PM',
  default_period text NOT NULL DEFAULT 'first_half',
  columns jsonb NOT NULL DEFAULT '{"in":"IN","out":"OUT","schedule":"Working Schedule","remarks":"REMARKS"}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dtr_template TO service_role;
ALTER TABLE public.dtr_template ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dtr_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  emp_no text NOT NULL DEFAULT '',
  name text NOT NULL DEFAULT '',
  designation text NOT NULL DEFAULT '',
  area text NOT NULL DEFAULT '',
  month int NOT NULL DEFAULT 1,
  year int NOT NULL DEFAULT 2026,
  period text NOT NULL DEFAULT 'first_half',
  certified_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.dtr_records TO service_role;
ALTER TABLE public.dtr_records ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.dtr_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL REFERENCES public.dtr_records(id) ON DELETE CASCADE,
  day int NOT NULL,
  time_in text NOT NULL DEFAULT '',
  time_out text NOT NULL DEFAULT '',
  schedule text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  UNIQUE (record_id, day)
);
GRANT ALL ON public.dtr_entries TO service_role;
ALTER TABLE public.dtr_entries ENABLE ROW LEVEL SECURITY;
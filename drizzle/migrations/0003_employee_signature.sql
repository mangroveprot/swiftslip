ALTER TABLE public.dtr_records
  ADD COLUMN IF NOT EXISTS employee_signature text NOT NULL DEFAULT '';

-- 0019 — Overtime (OT) forms.
--
-- Mirrors the OB / LOA / COS shape: `ot_forms` holds the header, the reason and
-- the three sign-off blocks plus the attachment columns; `ot_entries` holds one
-- row per OT date (the template repeats its value row), the way `cos_schedules`
-- backs a COS form.
--
-- ORDER: run after 0018_drop_dtr_template.sql.

CREATE TABLE IF NOT EXISTS public.ot_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  id_number text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  date_filed text NOT NULL DEFAULT '',
  employee_signature text NOT NULL DEFAULT '',
  reasons text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  received_by text NOT NULL DEFAULT '',
  processed_by text NOT NULL DEFAULT '',
  approved_via_viber boolean NOT NULL DEFAULT false,
  attachment_path text,
  attachment_name text,
  attachment_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ot_forms TO service_role;
ALTER TABLE public.ot_forms ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ot_forms_owner_id_idx ON public.ot_forms(owner_id);

CREATE TABLE IF NOT EXISTS public.ot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.ot_forms(id) ON DELETE CASCADE,
  idx int NOT NULL,
  date_of_ot text NOT NULL DEFAULT '',
  regular_from text NOT NULL DEFAULT '',
  regular_to text NOT NULL DEFAULT '',
  actual_from text NOT NULL DEFAULT '',
  actual_to text NOT NULL DEFAULT '',
  total_hours text NOT NULL DEFAULT '',
  validation text NOT NULL DEFAULT '',
  UNIQUE (form_id, idx)
);
GRANT ALL ON public.ot_entries TO service_role;
ALTER TABLE public.ot_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ot_entries_form_id_idx ON public.ot_entries(form_id);

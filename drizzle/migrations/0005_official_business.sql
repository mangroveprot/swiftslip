-- Official Business (OB) forms: header + itinerary lines, owned per user.

CREATE TABLE IF NOT EXISTS public.ob_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.access_codes(id) ON DELETE CASCADE,
  id_number text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  date_filed text NOT NULL DEFAULT '',
  date_of_ob text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  employee_signature text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.ob_forms TO service_role;
ALTER TABLE public.ob_forms ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS ob_forms_owner_id_idx ON public.ob_forms(owner_id);

CREATE TABLE IF NOT EXISTS public.ob_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.ob_forms(id) ON DELETE CASCADE,
  idx int NOT NULL,
  from_place text NOT NULL DEFAULT '',
  to_place text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  time_departure text NOT NULL DEFAULT '',
  time_return text NOT NULL DEFAULT '',
  UNIQUE (form_id, idx)
);
GRANT ALL ON public.ob_entries TO service_role;
ALTER TABLE public.ob_entries ENABLE ROW LEVEL SECURITY;

-- 0040 — Statement of Liquidation (LIQ) forms.
--
-- A single-page landscape sheet (GN 238, rev 03/00). Like LOA this is an
-- employee-filled record with no HR queue: the employee fills it, prints it and
-- hands the paper in. The sheet's own APPROVED BY / ACCOUNTING boxes are
-- static blanks for now (owner: "not all is editable, only the current I fill").
--
-- GEOMETRY: the paper form is a 23-column table. Only the cells the owner fills
-- today are inputs; the rest of the sheet is printed exactly as the paper form
-- leaves it (blank). The amounts are kept as text so the typed value round-trips
-- (the sheet shows "150.00", not a locale-formatted number).
--
-- ORDER: run after 0039_ob_resubmit_draft.sql. RLS enabled with no policies —
-- access is through the app's service-role key only, like every other form.

CREATE TABLE IF NOT EXISTS public.liq_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  department text NOT NULL DEFAULT '',
  section_location text NOT NULL DEFAULT '',
  cost_center text NOT NULL DEFAULT '',
  date_prepared text NOT NULL DEFAULT '',
  trip_to text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  -- "PESOS" | "DOLLARS" — the two boxes beside PURPOSE.
  currency text NOT NULL DEFAULT 'PESOS',
  prepared_by text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  -- The approval trail, the same shape every other form uses: the saved
  -- signature printed above PREPARED BY, the uploaded approval slip, its
  -- "Approved" tick and the blue "Approved via Viber" note the tick drives.
  employee_signature text NOT NULL DEFAULT '',
  approved_via_viber boolean NOT NULL DEFAULT false,
  attachment_path text,
  attachment_name text,
  attachment_approved boolean NOT NULL DEFAULT false,
  attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.liq_forms TO service_role;
ALTER TABLE public.liq_forms ENABLE ROW LEVEL SECURITY;

-- If 0040 ran before the approval trail was added, bring the table up to date.
ALTER TABLE public.liq_forms
  ADD COLUMN IF NOT EXISTS employee_signature text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS approved_via_viber boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS attachment_backend text NOT NULL DEFAULT 'supabase'
    CHECK (attachment_backend IN ('supabase', 'b2'));

CREATE INDEX IF NOT EXISTS liq_forms_owner_id_idx ON public.liq_forms(owner_id);

-- One row per expense line (1..15). Only line 1 is editable today, but the
-- child table is modelled for the whole sheet so enabling lines 2-15 later is a
-- UI change, not a migration.
CREATE TABLE IF NOT EXISTS public.liq_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id uuid NOT NULL REFERENCES public.liq_forms(id) ON DELETE CASCADE,
  idx int NOT NULL,
  expense_date text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  transpo text NOT NULL DEFAULT '',
  fuel_gas text NOT NULL DEFAULT '',
  meals text NOT NULL DEFAULT '',
  office_supplies text NOT NULL DEFAULT '',
  load_accommodation text NOT NULL DEFAULT '',
  entertainment_gifts text NOT NULL DEFAULT '',
  other_expenses text NOT NULL DEFAULT '',
  UNIQUE (form_id, idx)
);
GRANT ALL ON public.liq_expenses TO service_role;
ALTER TABLE public.liq_expenses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS liq_expenses_form_id_idx ON public.liq_expenses(form_id);

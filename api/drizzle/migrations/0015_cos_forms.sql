-- 0015 — Change of Schedule (COS) forms.
--
-- Mirrors ob_forms / loa_forms as a single-row form (no child table): identity
-- fields, the change type (Shift Schedule / Rest Day), the effectivity date,
-- the FROM / TO schedule lines, the employee signature, the reason body, the
-- three sign-off blocks (Approved by / Received by / Processed by), and the
-- attachment columns exactly like the OB slip.
--
-- ORDER: run after 0014_loa_other_attachments.sql.
-- Like every other form table it is owned per user: RLS enabled with no
-- policies, access through the app's service-role key only.

CREATE TABLE IF NOT EXISTS public.cos_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  id_number text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  plant_location text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  date_filed text NOT NULL DEFAULT '',
  -- "shift" | "rest_day" | "" — the two boxes under "Change of Work Schedule".
  change_type text NOT NULL DEFAULT '',
  effectivity_date text NOT NULL DEFAULT '',
  -- The SCHEDULE FROM / TO lines, free text as typed (e.g. "10/07/2026 - 8am - 5pm").
  schedule_from text NOT NULL DEFAULT '',
  schedule_to text NOT NULL DEFAULT '',
  employee_signature text NOT NULL DEFAULT '',
  -- The REASON/S FOR CHANGE OF SCHEDULE body.
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
GRANT ALL ON public.cos_forms TO service_role;
ALTER TABLE public.cos_forms ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS cos_forms_owner_id_idx ON public.cos_forms(owner_id);

-- 0013 — Leave of Absence (LOA) forms.
--
-- Mirrors ob_forms as a single-row form (no itinerary table): identity fields,
-- inclusive dates plus the free-text "days applied" (computed from From/To but
-- editable — e.g. "4 hours"), the leave-type box, pay status, reasons,
-- report-back date, the approval fields, and the medical-certificate
-- attachment columns (path / name / approved) exactly like the OB slip.
--
-- ORDER: run after 0012_profile_signature.sql (0012 has already been run).
-- Like every other form table it is owned per user: RLS enabled with no
-- policies, access through the app's service-role key only.

CREATE TABLE IF NOT EXISTS public.loa_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  id_number text NOT NULL DEFAULT '',
  employee_name text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  date_filed text NOT NULL DEFAULT '',
  date_from text NOT NULL DEFAULT '',
  date_to text NOT NULL DEFAULT '',
  days_applied text NOT NULL DEFAULT '',
  leave_type text NOT NULL DEFAULT '',
  leave_type_other text NOT NULL DEFAULT '',
  pay_status text NOT NULL DEFAULT '',
  reasons text NOT NULL DEFAULT '',
  report_back_date text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  approved_via_viber boolean NOT NULL DEFAULT false,
  employee_signature text NOT NULL DEFAULT '',
  attachment_path text,
  attachment_name text,
  attachment_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.loa_forms TO service_role;
ALTER TABLE public.loa_forms ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS loa_forms_owner_id_idx ON public.loa_forms(owner_id);

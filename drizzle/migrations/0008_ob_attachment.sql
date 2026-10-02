-- Official Business: approved-attachment support.
-- The approval-slip document itself lives in the `swiftslip` storage bucket
-- under ApprovalSlip/<owner-id>/<form-id>-<file> (private — served only through
-- short-lived signed URLs); the database only stores where it is, how it was
-- named, and whether it has been approved.

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text,
  ADD COLUMN IF NOT EXISTS attachment_approved boolean NOT NULL DEFAULT false;

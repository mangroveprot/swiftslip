-- Daily Time Record: supporting-document attachment.
-- DTRs are certified, not approved, so unlike the OB approval slip there is no
-- approval column here — upload / view / remove only. Files live in the same
-- private `swiftslip` bucket under ApprovalSlip/<owner-id>/<record-id>-<file>,
-- served only through short-lived signed URLs.

ALTER TABLE public.dtr_records
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

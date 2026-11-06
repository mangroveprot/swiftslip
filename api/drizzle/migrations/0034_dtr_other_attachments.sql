-- 0034 — Additional supporting files on a DTR record.
--
-- The same "supporting documents" card the LOA and OT forms have: up to 8 more
-- files (PDF, image, Office document), 10 MB each. Their bytes live in the
-- existing private bucket
-- (ApprovalSlip/<owner-id>/<row-id>-extra-…); this column only carries the
-- stored paths and original names as a JSON array.
--
-- The upload/list/remove service is already table-agnostic
-- (attachment.service.ts), so this column is the only storage change DTR
-- needs — plus `withOthers: true` on the record routes.
--
-- ORDER: run after 0033_rename_storage_root.sql.

ALTER TABLE public.dtr_records
  ADD COLUMN IF NOT EXISTS other_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

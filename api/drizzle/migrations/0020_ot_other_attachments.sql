-- 0020 — Additional supporting files on an OT form.
--
-- The same "supporting documents" card the LOA form has: up to 8 more files
-- (PDF, image, Office document), 10 MB each, optional for approval. Their bytes
-- live in the existing private bucket
-- (ApprovalSlip/<owner-id>/<row-id>-extra-…); this column only carries the
-- stored paths and original names as a JSON array.
--
-- The upload/list/remove service is already table-agnostic
-- (`attachments.server.ts`), so this column is the only storage change OT needs.
--
-- ORDER: run after 0019_ot_forms.sql.

ALTER TABLE public.ot_forms
  ADD COLUMN IF NOT EXISTS other_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

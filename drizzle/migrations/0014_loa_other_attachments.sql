-- 0014 — Additional supporting files on an LOA form.
--
-- Beside the single medical certificate, a form can hold up to 8 more
-- documents (a second medical note, lab result, …), 10 MB each, optional for
-- approval. Their bytes live in the existing private bucket
-- (ApprovalSlip/<owner-id>/<row-id>-extra-…); this column only carries the
-- stored paths and original names as a JSON array.
--
-- ORDER: run after 0013_loa_forms.sql (which must have been run first).

ALTER TABLE public.loa_forms
  ADD COLUMN IF NOT EXISTS other_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 0033 — Rename the storage root: ApprovalSlip/ → FormAttachement/
--
-- The folder was named after the first thing that ever had an attachment. It
-- now holds DTR, OB, LOA, COS and OT files, so the name is wrong.
--
-- ORDER MATTERS. Do not run this on its own:
--
--   1. cd api && npx ts-node --transpile-only scripts/rename-storage-root.ts --phase=copy
--        → duplicates every object under the new root, leaves the old ones.
--          Nothing breaks: the paths below still point at objects that exist.
--   2. Run THIS file.
--        → every stored path now points at the copy.
--   3. Deploy the API with STORAGE_ROOT = 'FormAttachement'.
--        → new uploads land in the new folder, and the orphan scan recognises it.
--   4. npx ts-node --transpile-only scripts/rename-storage-root.ts --phase=cleanup
--        → deletes the old root, which nothing references any more.
--
-- Renaming the folder by hand in the Supabase dashboard instead would 404 every
-- download AND make the orphan scanner treat every file as unowned, because
-- `ownerIdOf()` matches the root by name. That is why this is a code change plus
-- this migration plus the object move, not a drag-and-drop.
--
-- Every statement is guarded by a LIKE, so re-running the file is a no-op.

-- ── The single attachment on each form ──────────────────────────────────────

UPDATE public.dtr_records
   SET attachment_path = replace(attachment_path, 'ApprovalSlip/', 'FormAttachement/')
 WHERE attachment_path LIKE 'ApprovalSlip/%';

UPDATE public.ob_forms
   SET attachment_path = replace(attachment_path, 'ApprovalSlip/', 'FormAttachement/')
 WHERE attachment_path LIKE 'ApprovalSlip/%';

UPDATE public.loa_forms
   SET attachment_path = replace(attachment_path, 'ApprovalSlip/', 'FormAttachement/')
 WHERE attachment_path LIKE 'ApprovalSlip/%';

UPDATE public.cos_forms
   SET attachment_path = replace(attachment_path, 'ApprovalSlip/', 'FormAttachement/')
 WHERE attachment_path LIKE 'ApprovalSlip/%';

UPDATE public.ot_forms
   SET attachment_path = replace(attachment_path, 'ApprovalSlip/', 'FormAttachement/')
 WHERE attachment_path LIKE 'ApprovalSlip/%';

-- ── The extra-attachment lists (jsonb [{ path, name }, …]) ──────────────────
--
-- Only LOA and OT keep more than one file. The CASE leaves non-matching entries
-- byte-identical, and WITH ORDINALITY keeps the order the user uploaded them in.

UPDATE public.loa_forms AS f
   SET other_attachments = (
         SELECT jsonb_agg(
                  CASE
                    WHEN entry.elem->>'path' LIKE 'ApprovalSlip/%'
                      THEN jsonb_set(
                             entry.elem,
                             '{path}',
                             to_jsonb(replace(entry.elem->>'path', 'ApprovalSlip/', 'FormAttachement/'))
                           )
                    ELSE entry.elem
                  END
                  ORDER BY entry.ord
                )
           FROM jsonb_array_elements(f.other_attachments) WITH ORDINALITY AS entry(elem, ord)
       )
 WHERE f.other_attachments::text LIKE '%"ApprovalSlip/%';

UPDATE public.ot_forms AS f
   SET other_attachments = (
         SELECT jsonb_agg(
                  CASE
                    WHEN entry.elem->>'path' LIKE 'ApprovalSlip/%'
                      THEN jsonb_set(
                             entry.elem,
                             '{path}',
                             to_jsonb(replace(entry.elem->>'path', 'ApprovalSlip/', 'FormAttachement/'))
                           )
                    ELSE entry.elem
                  END
                  ORDER BY entry.ord
                )
           FROM jsonb_array_elements(f.other_attachments) WITH ORDINALITY AS entry(elem, ord)
       )
 WHERE f.other_attachments::text LIKE '%"ApprovalSlip/%';

-- ── The B2 object registry, in case a key ever lived under the old root ─────
--
-- Form attachments are Supabase-only today (the `files` app uses its own random
-- keys), so this normally updates nothing. It is here so the rename is complete
-- rather than "complete for the paths we remembered".

UPDATE public.files
   SET key = replace(key, 'ApprovalSlip/', 'FormAttachement/')
 WHERE key LIKE 'ApprovalSlip/%';

-- ── Check ──────────────────────────────────────────────────────────────────
-- Run this afterwards; every count must be 0.

-- SELECT
--   (SELECT count(*) FROM public.dtr_records WHERE attachment_path LIKE 'ApprovalSlip/%')
-- + (SELECT count(*) FROM public.ob_forms    WHERE attachment_path LIKE 'ApprovalSlip/%')
-- + (SELECT count(*) FROM public.loa_forms   WHERE attachment_path LIKE 'ApprovalSlip/%')
-- + (SELECT count(*) FROM public.cos_forms   WHERE attachment_path LIKE 'ApprovalSlip/%')
-- + (SELECT count(*) FROM public.ot_forms    WHERE attachment_path LIKE 'ApprovalSlip/%')
-- + (SELECT count(*) FROM public.loa_forms   WHERE other_attachments::text LIKE '%"ApprovalSlip/%')
-- + (SELECT count(*) FROM public.ot_forms    WHERE other_attachments::text LIKE '%"ApprovalSlip/%')
-- + (SELECT count(*) FROM public.files       WHERE key LIKE 'ApprovalSlip/%')
--   AS remaining_old_paths;

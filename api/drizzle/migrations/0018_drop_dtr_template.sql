-- 0018 — Drop the DTR template table.
--
-- The DTR's form wording (title, org name, column headers, signature labels)
-- used to live in a single editable row here, behind Settings → DTR template.
-- That screen is gone and the wording is fixed in code now
-- (src/shared/dtr-template.ts), so the table has nothing left to serve.
--
-- ORDER: run after 0017_cos_schedule_times.sql.
--
-- NOTE: this is destructive and not reversible — the row is dropped with the
-- table. The values it held are the ones now hardcoded in dtr-template.ts.

DROP TABLE IF EXISTS public.dtr_template;

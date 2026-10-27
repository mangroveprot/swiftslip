-- 0027 — Register the Regasco Ticketing System as a grantable app.
--
-- The ticketing system lives on another host (ticketing.regasco.ph:2424). It
-- still belongs in App access, because "who may raise tickets?" is a question
-- administrators ask in the same place as "who may open the Inventory?". This
-- migration widens the CHECK so a `ticketing` rule can be stored.
--
-- WHAT THE RULE DECIDES
--   Only whether the card appears in the "Where would you like to go?" chooser
--   and in the Switch app menu. The ticketing app is served by another host, so
--   nothing here can guard its screens - its own login stays its own gate.
--
-- STARTING POINT
--   `defaultAccess` includes `ticketing` in the staff default, because every
--   account could already raise a ticket before it became a managed app: the
--   card must not disappear from someone who had it yesterday. An admin can
--   still block it with one department, position or person rule. Admins always
--   have every app (they bypass the table entirely).
--
-- ORDER: run after 0026_cos_schedule_times_repair.sql.
-- The app treats a missing table as "no rules", so the code is safe to deploy
-- before this runs - a `ticketing` rule just fails to save (422) until then.

ALTER TABLE public.app_access_rules
  DROP CONSTRAINT IF EXISTS app_access_rules_app_key_check;

ALTER TABLE public.app_access_rules
  ADD CONSTRAINT app_access_rules_app_key_check
  CHECK (app_key IN ('swiftslip', 'inventory', 'ticketing'));

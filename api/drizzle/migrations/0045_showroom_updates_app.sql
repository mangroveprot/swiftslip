-- 0045 - Register Showroom Updates as a grantable app.
--
-- Showroom Updates is its own app: its own chooser card, its own sidebar entry
-- and its own `requireApp('showroom-updates')` guard on every API route. The
-- data lives in the RGC inventory database (see apps/showroom-updates), but the
-- GRANT lives here with every other app, so "who may open it?" is answered in
-- the same Admin Panel screen as Inventory and HR.
--
-- This migration only widens the CHECK constraint; it stores no rule. Nobody
-- gets the app by default (STAFF_DEFAULT in resolve-access.ts still lists only
-- SwiftSlip and Ticketing), so an admin must allow it per person, department or
-- position. Admins always have every app and bypass the table.
--
-- ORDER: run after 0027_app_access_ticketing.sql.
-- The app treats a missing table as "no rules", so the code is safe to deploy
-- before this runs - a `showroom-updates` rule just fails to save (422) until
-- then.

ALTER TABLE public.app_access_rules
  DROP CONSTRAINT IF EXISTS app_access_rules_app_key_check;

ALTER TABLE public.app_access_rules
  ADD CONSTRAINT app_access_rules_app_key_check
  CHECK (app_key IN ('swiftslip', 'inventory', 'showroom-updates', 'ticketing', 'hr'));

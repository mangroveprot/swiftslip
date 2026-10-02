-- Signature saved on the profile (My Account → Employee details) so every new
-- DTR record / OB form starts with it alongside the other identity fields.
-- Forms keep their own editable copy; this is only the auto-fill source.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signature text NOT NULL DEFAULT '';

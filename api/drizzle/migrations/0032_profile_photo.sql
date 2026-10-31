-- 0032 — Profile photo.
--
-- One small image per person, shown on My profile and in the sidebar footer.
--
-- Stored as a data URL in the row, exactly like `profiles.signature`, rather
-- than in Supabase Storage or B2. The reasons:
--
--   * it is ONE 256 × 256 square per account (the cropper exports WebP, ~15 KB),
--     not a user library of files;
--   * the sidebar needs it on every page, so a bucket round-trip plus a signed
--     URL would be pure latency on the hot path;
--   * it is read and written with the rest of the profile — no orphan cleanup,
--     no backend rule, no second source of truth to keep in sync.
--
-- Empty string means "no photo": the UI falls back to the person's initials,
-- so existing rows need no backfill and no NULL handling.
--
-- RLS stays as it is on the table (enabled, no policies): only the API's
-- service-role key reads or writes it, and every query is scoped to the
-- signed-in user in the service layer.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo text NOT NULL DEFAULT '';

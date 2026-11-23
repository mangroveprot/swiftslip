-- 0046 — Profile photo framing.
--
-- A cropped still is baked into its 256 × 256 export, so it needs no framing
-- data: this is the identity (zoom 1, centred) for every existing row.
--
-- An animated GIF is the opposite. It is stored exactly as the user picked it,
-- because painting it onto a canvas would keep one frame and the picture would
-- stop moving. Its framing therefore has to be remembered separately and
-- applied with CSS wherever the face is drawn:
--
--   photo_zoom  how far in, 1 = fills the circle, 3 = the cropper's limit
--   photo_x     visible window centre, as a fraction of the circle's diameter
--   photo_y     (0 = centred), so 96 px in the card and 36 px in the sidebar
--               show the same part of the picture
--
-- Defaults leave every photo saved before this migration rendering exactly as
-- it does today, so no backfill is needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_zoom double precision NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS photo_x double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_y double precision NOT NULL DEFAULT 0;

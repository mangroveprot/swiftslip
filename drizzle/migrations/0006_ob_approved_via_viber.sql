-- Official Business: track whether approval was granted "via Viber".
-- When true, the OB form/preview/export shows the "Approved via Viber" note.

ALTER TABLE public.ob_forms
  ADD COLUMN IF NOT EXISTS approved_via_viber boolean NOT NULL DEFAULT false;

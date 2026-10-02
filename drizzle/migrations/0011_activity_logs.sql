-- 0011 — activity_logs: the admin panel's audit trail.
--
-- Simple "who did what, when" rows: sign-ins (so someone spraying passwords
-- shows up), OB / DTR create & remove, attachment uploads/removals and account
-- changes. Written only by the app through the service role — RLS is enabled
-- with no policies, so PostgREST's other roles can neither read nor write it.
--
-- Retention without a scheduler: a statement-level AFTER INSERT trigger drops
-- rows older than 30 days on every write (daily sign-ins make sure that
-- happens), and the admin list query prunes on read as well — nothing older
-- than 30 days is ever kept or shown.
--
-- ORDER: run after 0010_users_rename.sql, in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_id text,
  actor_name text,
  actor_number text,
  target text,
  detail text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_at_idx
  ON public.activity_logs (created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.prune_activity_logs() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.activity_logs
  WHERE created_at < now() - INTERVAL '30 days';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS prune_activity_logs ON public.activity_logs;

CREATE TRIGGER prune_activity_logs
  AFTER INSERT ON public.activity_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prune_activity_logs();

-- 0042 — Sessions live on the server, so signing out actually ends them.
--
-- The cookie used to be self-contained: signing out only deleted the browser's
-- copy, so a cookie copied beforehand kept working until it expired. A session
-- is now a row here, and the cookie carries only its random id (signed with
-- SESSION_SECRET). Every request checks the row, so deleting it ends that
-- session everywhere, at once, including any copy of the cookie.
--
-- `token_hash` is sha256(session id): the database never holds the value that
-- is in the cookie, so a leaked table alone cannot be replayed as a session.
-- `remembered` records whether the sign-in asked for the 30-day cookie, so the
-- admin panel can say which sessions will last, and a password change can
-- re-issue this device with the same lifetime.
--
-- Rows are removed when a session is revoked (sign-out, admin action) and
-- expired rows are pruned on the next successful sign-in. Deleting an account
-- removes its sessions with it.
--
-- ORDER: run after 0041_profile_employer.sql, in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  remembered boolean NOT NULL DEFAULT false,
  ip text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx
  ON public.sessions (user_id);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx
  ON public.sessions (expires_at);

CREATE INDEX IF NOT EXISTS sessions_last_seen_at_idx
  ON public.sessions (last_seen_at DESC);

GRANT ALL ON public.sessions TO service_role;

-- Service role only, like every other table: RLS is on with no policies.
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

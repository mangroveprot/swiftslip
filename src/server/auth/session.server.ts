// Aliased so the rules-of-hooks lint doesn't flag TanStack's `useSession`
// (a server utility, not a React hook) called outside a component.
import { useSession as openSession } from "@tanstack/react-start/server";

import { getServerConfig } from "@/config/env.server";
import type { Role, SessionUser } from "@/shared/types";

type SessionData = {
  id?: string;
  role?: Role;
  label?: string;
  idNumber?: string;
  /** The login was started with "Remember me" ticked. */
  remember?: boolean;
  /** When this login started — the 12-hour cap is measured from here. */
  signedInAt?: number;
};

/**
 * ONE session config for the whole app. h3 seals a session with a single ttl
 * and every read re-validates it against the caller's own `maxAge` — a
 * per-sign-in maxAge therefore gets overruled by the very next request and
 * kills remembered sessions after 12 hours. So the long seal/cookie lifetime
 * is used everywhere, and the short 12-hour login WITHOUT "Remember me" is
 * enforced in `getSessionUser` from the session's own data instead.
 */
function appSession() {
  const { session, isProd } = getServerConfig();
  return openSession<SessionData>({
    password: session.secret,
    name: session.cookieName,
    maxAge: session.rememberMaxAgeSeconds,
    cookie: { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" },
  });
}

export async function startSession(user: SessionUser, remember = false) {
  const session = await appSession();
  await session.update({
    id: user.id,
    role: user.role,
    label: user.label,
    idNumber: user.idNumber,
    remember,
    signedInAt: Date.now(),
  });
}

export async function endSession() {
  const session = await appSession();
  await session.clear();
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const { session: settings } = getServerConfig();
  const session = await appSession();
  const { id, role, label, idNumber, remember, signedInAt } = session.data;
  if (!role || !id) return null;
  // Cookies issued before the session carried a start time can't be aged —
  // treat them as ended (one forced sign-in after this ships).
  if (typeof signedInAt !== "number") return null;
  // Without "Remember me" the login lasts one workday, checked here because
  // h3's seal alone can't tell the two kinds of login apart.
  if (!remember && Date.now() - signedInAt > settings.maxAgeSeconds * 1000) return null;
  return {
    id,
    role,
    label: label ?? "",
    idNumber: idNumber ?? "",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error("Please sign in first.");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("Only an administrator can do this.");
  return user;
}

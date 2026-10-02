// Aliased so the rules-of-hooks lint doesn't flag TanStack's `useSession`
// (a server utility, not a React hook) called outside a component.
import { useSession as openSession } from "@tanstack/react-start/server";

import { getServerConfig } from "@/config/env.server";
import type { Role, SessionUser } from "@/shared/types";

type SessionData = { id?: string; role?: Role; label?: string; idNumber?: string };

function appSession() {
  const { session, isProd } = getServerConfig();
  return openSession<SessionData>({
    password: session.secret,
    name: session.cookieName,
    maxAge: session.maxAgeSeconds,
    cookie: { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" },
  });
}

export async function startSession(user: SessionUser) {
  const session = await appSession();
  await session.update({
    id: user.id,
    role: user.role,
    label: user.label,
    idNumber: user.idNumber,
  });
}

export async function endSession() {
  const session = await appSession();
  await session.clear();
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await appSession();
  if (!session.data.role || !session.data.id) return null;
  return {
    id: session.data.id,
    role: session.data.role,
    label: session.data.label ?? "",
    // Cookies issued before this field existed simply lack it.
    idNumber: session.data.idNumber ?? "",
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

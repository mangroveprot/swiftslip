import { useSession } from "@tanstack/react-start/server";

import { getServerConfig } from "@/config/env.server";
import type { Role, SessionUser } from "@/shared/types";

type SessionData = { role?: Role; label?: string };

function appSession() {
  const { session, isProd } = getServerConfig();
  return useSession<SessionData>({
    password: session.secret,
    name: session.cookieName,
    maxAge: session.maxAgeSeconds,
    cookie: { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" },
  });
}

export async function startSession(user: SessionUser) {
  const session = await appSession();
  await session.update({ role: user.role, label: user.label });
}

export async function endSession() {
  const session = await appSession();
  await session.clear();
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await appSession();
  if (!session.data.role) return null;
  return { role: session.data.role, label: session.data.label ?? "" };
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

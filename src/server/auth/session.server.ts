// Aliased so the rules-of-hooks lint doesn't flag TanStack's `useSession`
// (a server utility, not a React hook) called outside a component.
import { createHash } from "node:crypto";
import { useSession as openSession } from "@tanstack/react-start/server";

import { getServerConfig } from "@/config/env.server";
import { getDb } from "@/server/db/client.server";
import type { Role, SessionUser } from "@/shared/types";

type SessionData = {
  id?: string;
  role?: Role;
  label?: string;
  idNumber?: string;
  /**
   * Short fingerprint of the account's current `password_hash`. A password
   * change (by the user or by an admin reset) changes the hash, so every cookie
   * issued before it stops matching — that is how other devices are signed out
   * without a database column for session versions.
   */
  pw?: string;
};

function appSession() {
  const { session, isProd } = getServerConfig();
  return openSession<SessionData>({
    password: session.secret,
    name: session.cookieName,
    maxAge: session.maxAgeSeconds,
    cookie: { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" },
  });
}

/** Stable, non-reversible marker for one stored password hash. */
function passwordFingerprint(hash: string): string {
  return createHash("sha256").update(hash, "utf8").digest("hex").slice(0, 16);
}

export async function startSession(user: SessionUser) {
  // Read the hash here rather than carrying it through SessionUser: the sign-in
  // response is returned to the browser and must never contain it.
  const { data } = await getDb()
    .from("users")
    .select("password_hash")
    .eq("id", user.id)
    .maybeSingle();

  const session = await appSession();
  const payload: SessionData = {
    id: user.id,
    role: user.role,
    label: user.label,
    idNumber: user.idNumber,
  };
  if (data?.password_hash) payload.pw = passwordFingerprint(data.password_hash);
  await session.update(payload);
}

export async function endSession() {
  const session = await appSession();
  await session.clear();
}

/**
 * The signed-in user, revalidated against the database on every request.
 *
 * The cookie is only a pointer to an account; it is not the source of truth for
 * the role. Re-reading `users` means a demoted admin loses admin powers
 * immediately, a deleted account stops working, and a password change revokes
 * every other device — instead of waiting up to the 12-hour cookie lifetime.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await appSession();
  const userId = session.data.id;
  if (!userId) return null;

  const { data } = await getDb()
    .from("users")
    .select("role,id_number,password_hash")
    .eq("id", userId)
    .maybeSingle();

  // The account was deleted while this cookie was still alive.
  if (!data) {
    await session.clear();
    return null;
  }

  const role = data.role;
  if (role !== "admin" && role !== "user") {
    await session.clear();
    return null;
  }

  // Cookies issued before the fingerprint existed are grandfathered until they
  // expire; every cookie issued from now on is checked.
  if (
    session.data.pw &&
    data.password_hash &&
    session.data.pw !== passwordFingerprint(data.password_hash)
  ) {
    await session.clear();
    return null;
  }

  // Keep the cookie's copy of the role in step so it can't go stale again.
  if (session.data.role !== role) {
    await session.update({ ...session.data, role });
  }

  return {
    id: userId,
    role,
    label: session.data.label ?? "",
    // The admin can rename an ID number; the database is authoritative.
    idNumber: data.id_number ?? "",
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

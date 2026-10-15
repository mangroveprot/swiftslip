import { createServerFn } from "@tanstack/react-start";

import { endSession, getSessionUser, startSession } from "@/server/auth/session.server";
import { resolveApps } from "@/server/auth/access.server";
import { logActivity, requestIp } from "@/server/services/activity-log.server";
import { verifyPassword } from "@/server/services/auth.server";
import { signInInput } from "@/shared/schemas";

export const signIn = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(async ({ data }) => {
    const user = await verifyPassword(data.idNumber, data.password);
    if (!user) {
      // Login security: rejected attempts land in the admin log (ID + IP) so
      // someone spraying passwords is visible. Infrastructure errors from
      // verifyPassword still throw and aren't logged as account attempts.
      await logActivity({
        action: "signin.failed",
        actorNumber: data.idNumber,
        detail: "Wrong ID number or password",
        ip: requestIp(),
      });
      return { ok: false as const };
    }
    await startSession(user);
    await logActivity({
      action: "signin.success",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      ip: requestIp(),
    });
    return { ok: true as const, ...user };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { ok: true as const };
});

/**
 * Who is signed in right now? `null` when nobody is.
 *
 * Carries the resolved app grants as well as the identity. They are resolved
 * from the database on every read rather than baked into the cookie, so an
 * admin changing a rule takes effect on the next page load instead of waiting
 * for the session to expire. This is display/UI only — the actual gate is
 * `requireApp` in `server/auth/access.server.ts` plus the route guards.
 */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  return { ...user, apps: await resolveApps(user) };
});

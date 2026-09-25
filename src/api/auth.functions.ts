import { createServerFn } from "@tanstack/react-start";

import { endSession, getSessionUser, startSession } from "@/server/auth/session.server";
import { verifyPassword } from "@/server/services/auth.server";
import { signInInput } from "@/shared/schemas";

export const signIn = createServerFn({ method: "POST" })
  .validator(signInInput)
  .handler(async ({ data }) => {
    const user = await verifyPassword(data.password);
    if (!user) return { ok: false as const };
    await startSession(user);
    return { ok: true as const, ...user };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  await endSession();
  return { ok: true as const };
});

/** Who is signed in right now? `null` when nobody is. */
export const getSession = createServerFn({ method: "GET" }).handler(async () => {
  return await getSessionUser();
});

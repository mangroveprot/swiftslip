import { api, ApiError, documentOf } from "@/lib/api-client";
import type { SessionDocument } from "@swiftslip/shared/api-types";
import type { signInInput } from "@swiftslip/shared/schemas";
import type { SessionUser } from "@swiftslip/shared/types";
import type { z } from "zod";

/**
 * Wrong ID number / password comes back as `{ ok: false }` so the form can show
 * its deliberately vague message. Everything else (throttled, server down…)
 * throws an `ApiError` whose message the form shows as-is.
 */
export const signIn = async ({ data }: { data: z.input<typeof signInInput> }) => {
  try {
    const user = documentOf(await api.post<SessionUser>("/auth/sign-in", data));
    return { ok: true as const, ...user };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return { ok: false as const };
    throw err;
  }
};

export const signOut = async () => {
  await api.post("/auth/sign-out");
  return { ok: true as const };
};

/**
 * Who is signed in right now? `null` when nobody is. Carries the resolved app
 * grants (UI only — the API enforces access on every route).
 */
export const getSession = async (): Promise<SessionDocument | null> =>
  (await api.get<SessionDocument>("/auth/session")).document ?? null;

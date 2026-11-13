import type { QueryClient } from "@tanstack/react-query";

import type { EmployeeProfile } from "@swiftslip/shared/types";

import { profileQueryOptions } from "./queries";

/**
 * Welcome that runs while the profile is still incomplete. A profile row can
 * exist with only the ID number (created with the account), so a missing name
 * is the classic first sign-in, but work details and the signature count too.
 *
 * Skipping never locks the app: once they leave the welcome, a "seen" flag
 * keeps it from opening again *for that sign-in*. Signing in again clears the
 * flag, so an unfinished profile gets another prompt instead of being
 * forgotten forever. A fully completed profile never sees the welcome.
 */

export type OnboardingStep = 1 | 2 | 3 | "done";

export type ProfileGaps = {
  name: boolean;
  work: boolean;
  signature: boolean;
};

/** Both prefixes are owned here so a new sign-in can clear them in one pass. */
const SEEN_PREFIX = "swiftslip.onboarding.seen:";
const STEP_PREFIX = "swiftslip.onboarding.step:";

const seenKey = (userId: string) => `${SEEN_PREFIX}${userId}`;
const stepKey = (userId: string) => `${STEP_PREFIX}${userId}`;

/** Collect first, then remove, mutating Storage while indexing it skips keys. */
function removePrefixed(storage: Storage, prefix: string): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

export function profileGaps(
  profile:
    | Pick<
        EmployeeProfile,
        "full_name" | "supervisor" | "area" | "department" | "designation" | "signature"
      >
    | null
    | undefined,
): ProfileGaps {
  const work = [profile?.supervisor, profile?.area, profile?.department, profile?.designation].some(
    (value) => Boolean(value?.trim()),
  );
  return {
    name: !profile?.full_name?.trim(),
    work: !work,
    signature: !profile?.signature?.trim(),
  };
}

/** Profile for the sign-in gate. A failed read must not trap the welcome. */
export async function loadProfileForGate(
  queryClient: QueryClient,
): Promise<EmployeeProfile | undefined> {
  try {
    return await queryClient.ensureQueryData(profileQueryOptions());
  } catch {
    return undefined;
  }
}

export function gapCount(gaps: ProfileGaps): number {
  return Number(gaps.name) + Number(gaps.work) + Number(gaps.signature);
}

/** The welcome has already been left during this sign-in (finished or skipped). */
export function hasSeenOnboarding(userId: string): boolean {
  try {
    return window.localStorage.getItem(seenKey(userId)) === "1";
  } catch {
    // Private mode that blocks storage: let them into the app rather than
    // trapping the welcome in a redirect loop.
    return true;
  }
}

export function markOnboardingSeen(userId: string): void {
  try {
    window.localStorage.setItem(seenKey(userId), "1");
  } catch {
    // Same as above, leaving the welcome still navigates.
  }
}

/** Step remembered for a refresh mid-welcome. Cleared when they enter the app. */
export function readOnboardingStep(userId: string): OnboardingStep | null {
  try {
    const raw = window.sessionStorage.getItem(stepKey(userId));
    if (raw === "1" || raw === "2" || raw === "3") return Number(raw) as 1 | 2 | 3;
    if (raw === "done") return "done";
    return null;
  } catch {
    return null;
  }
}

export function writeOnboardingStep(userId: string, step: OnboardingStep): void {
  try {
    window.sessionStorage.setItem(stepKey(userId), String(step));
  } catch {
    // The welcome still works; a refresh just starts at step 1.
  }
}

export function clearOnboardingStep(userId: string): void {
  try {
    window.sessionStorage.removeItem(stepKey(userId));
  } catch {
    // Nothing else depends on the key being gone.
  }
}

/**
 * A new sign-in gets a fresh welcome. Called both after the cookie is confirmed
 * and on sign-out: the first covers normal logins and expired sessions, the
 * second covers leaving mid-welcome or switching accounts in the same tab.
 *
 * Clearing every user's keys (rather than just the incoming one) also stops a
 * stale flag from a previous account deciding whether this login sees the
 * welcome. Storage failures are ignored, the gate falls back to its profile
 * check either way.
 */
export function resetOnboardingSession(): void {
  try {
    removePrefixed(window.localStorage, SEEN_PREFIX);
  } catch {
    // Private mode that blocks storage: nothing was written, nothing to clear.
  }
  try {
    removePrefixed(window.sessionStorage, STEP_PREFIX);
  } catch {
    // Same as above, a refresh just starts at the first unfinished step.
  }
}

/**
 * The gate used by `/choose`, `/_app`, `/hr`, `/admin` and `/onboarding` itself.
 * `hasSeenOnboarding` is deliberately checked first: skipping must still let
 * the user into the app for the rest of this sign-in, even with gaps left.
 */
export function needsOnboarding(
  userId: string,
  profile: EmployeeProfile | null | undefined,
): boolean {
  if (hasSeenOnboarding(userId)) return false;
  // Any missing part, name, work details or signature, prompts the welcome.
  // Checking only the name meant a user who saved it but skipped the rest
  // never saw the welcome again.
  if (gapCount(profileGaps(profile)) > 0) return true;
  // Everything is saved, but this tab is still on the "You're all set" card.
  return readOnboardingStep(userId) !== null;
}

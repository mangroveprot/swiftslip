import { useQuery } from "@tanstack/react-query";

import { profileQueryOptions } from "./queries";

/**
 * The signed-in person's profile photo — one cached value, safe to call from
 * anywhere.
 *
 * The photo is a data URL stored inside the profile row, so there is no second
 * request to make: every caller joins the same `["profile"]` query entry that
 * the profile page already fills, and gets the picture from memory on every
 * render after the first. Nothing re-downloads when the same face appears in
 * the sidebar, the admin panel and the profile card at once.
 *
 * Returns `undefined` when the person has no photo or the profile is still
 * loading — hand that straight to `<ProfileAvatar>`, which falls back to
 * initials, so callers never need their own "is it there yet" branch.
 *
 * To show someone ELSE's photo, pass an id to a variant of this hook; today
 * the app only ever renders the viewer's own.
 */
export function useProfilePhoto(): string | undefined {
  const { data } = useQuery(profileQueryOptions());
  return data?.photo || undefined;
}

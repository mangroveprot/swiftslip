import { useQuery } from "@tanstack/react-query";

import type { PhotoCrop } from "@swiftslip/shared/types";

import { profileQueryOptions } from "./queries";

/**
 * The signed-in person's profile photo and its framing, one cached value, safe
 * to call from anywhere.
 *
 * The photo is a signed URL inside the profile row, so there is no second
 * request to make: every caller joins the same `["profile"]` query entry that
 * the profile page already fills, and gets the picture from memory on every
 * render after the first. Nothing re-downloads when the same face appears in
 * the sidebar, the admin panel and the profile card at once.
 *
 * `crop` is only meaningful for an animated GIF, which is stored uncropped;
 * pass it straight to `<ProfileAvatar>` so the sidebar shows the same part of
 * the picture the card does. Both come back `undefined` while the profile is
 * still loading, and the avatar falls back to initials, so callers never need
 * their own "is it there yet" branch.
 *
 * To show someone ELSE's photo, pass an id to a variant of this hook; today
 * the app only ever renders the viewer's own.
 */
export function useProfilePhoto(): { photo: string | undefined; crop: PhotoCrop | undefined } {
  const { data } = useQuery(profileQueryOptions());
  return { photo: data?.photo || undefined, crop: data?.photo_crop };
}

import { queryOptions } from "@tanstack/react-query";

import { getMyProfile } from "@/api/profile.functions";
import { getProfileCard } from "@/api/access-codes.functions";

export const profileQueryOptions = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: () => getMyProfile(),
    retry: false,
    /**
     * The photo arrives as a freshly signed URL, so a refetch hands back a
     * different string for the same picture. Without a staleTime the sidebar
     * would re-sign and re-download the avatar on every mount and window
     * focus. Saving the profile (or the photo) invalidates this key, so the
     * five minutes only ever covers reads that changed nothing.
     */
    staleTime: 5 * 60_000,
  });

/**
 * Someone else's directory card, what the hover card on a face shows.
 *
 * One entry per person so two lists that show the same colleague share the
 * answer. The hover card content only mounts when it opens, so this runs on
 * hover and not for every avatar on the page. A deleted account stays deleted,
 * so the 404 is not retried.
 */
export const profileCardQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["profile-card", id],
    queryFn: () => getProfileCard(id),
    retry: false,
    staleTime: 5 * 60_000,
  });

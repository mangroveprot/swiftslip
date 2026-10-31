import { queryOptions } from "@tanstack/react-query";

import { getMyProfile } from "@/api/profile.functions";

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

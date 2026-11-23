import { useQuery } from "@tanstack/react-query";

import type { ProfileCard } from "@swiftslip/shared/types";

import { profileCardQueryOptions } from "./queries";

/**
 * One person's directory card, the data behind the hover card on a face.
 *
 * Call it from the component that only mounts while the card is open, so the
 * request happens on hover instead of once per avatar on a page of activity.
 * `loading` and `failed` are separated because they read differently: one is a
 * skeleton, the other is a card that says the details are unavailable (a
 * deleted account, or a link that could not be minted).
 */
export function useProfileCard(id: string): {
  card: ProfileCard | undefined;
  loading: boolean;
  failed: boolean;
} {
  const { data, isPending, isError } = useQuery(profileCardQueryOptions(id));
  return { card: data, loading: isPending, failed: isError };
}

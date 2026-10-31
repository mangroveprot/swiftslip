import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { getUserPhotos } from "@/api/access-codes.functions";

/**
 * Profile photos for a batch of account ids, as a plain `id → data URL` map.
 *
 * The admin lists all know which people they are about to draw, so they ask
 * once for that whole set instead of one request per row. The query key is the
 * sorted id set, which means two screens showing the same people share one
 * cache entry, and switching tabs (or opening a log page you just left) costs
 * nothing while it is fresh.
 *
 * A missing id is normal — that person has no photo — so callers hand the
 * result straight to `<ProfileAvatar>`, which falls back to initials.
 */
export function useUserPhotos(ids: Array<string | null | undefined>): Record<string, string> {
  const key = [...new Set(ids.filter((id): id is string => !!id))].sort().join(",");

  const { data } = useQuery({
    queryKey: ["user-photos", key],
    queryFn: () => getUserPhotos(key.split(",")),
    enabled: key.length > 0,
    // A photo only changes when that person edits their profile, so a few
    // minutes of staleness is invisible and keeps the lists instant.
    staleTime: 5 * 60_000,
  });

  return useMemo(() => Object.fromEntries((data ?? []).map((row) => [row.id, row.photo])), [data]);
}

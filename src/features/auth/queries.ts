import { queryOptions } from "@tanstack/react-query";

import { getSession } from "@/api/auth.functions";

export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: ["session"],
    queryFn: () => getSession(),
    // Route guards re-check the session on navigation; within this window they reuse the cache.
    staleTime: 30_000,
    retry: false,
  });

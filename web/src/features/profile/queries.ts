import { queryOptions } from "@tanstack/react-query";

import { getMyProfile } from "@/api/profile.functions";

export const profileQueryOptions = () =>
  queryOptions({
    queryKey: ["profile"],
    queryFn: () => getMyProfile(),
    retry: false,
  });

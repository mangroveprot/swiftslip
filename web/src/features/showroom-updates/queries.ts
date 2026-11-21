import { queryOptions } from "@tanstack/react-query";

import { getShowroomUpdates, getShowroomUpdateEvents } from "@/api/showroom-updates.functions";

/** The whole board (22 rows), filtered and searched client-side. */
export const showroomUpdatesQueryOptions = () =>
  queryOptions({
    queryKey: ["showroom-updates"],
    queryFn: () => getShowroomUpdates(),
    retry: false,
  });

/** One showroom's audit trail, loaded when its drawer opens. */
export const showroomUpdateEventsQueryOptions = (updateId: number) =>
  queryOptions({
    queryKey: ["showroom-updates", updateId, "events"],
    queryFn: () => getShowroomUpdateEvents({ updateId }),
    retry: false,
  });

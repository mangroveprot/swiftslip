import { queryOptions } from "@tanstack/react-query";

import { getAdminStatsFn, listActivityLogsFn } from "@/api/admin.functions";
import { listCodes } from "@/api/access-codes.functions";

export const accessCodesQueryOptions = () =>
  queryOptions({
    queryKey: ["codes"],
    queryFn: () => listCodes(),
  });

export const adminStatsQueryOptions = () =>
  queryOptions({
    queryKey: ["admin-stats"],
    queryFn: () => getAdminStatsFn(),
  });

export type ActivityLogFilters = {
  search: string;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
};

export const activityLogsQueryOptions = (filters: ActivityLogFilters) =>
  queryOptions({
    queryKey: ["activity-logs", filters],
    queryFn: () => listActivityLogsFn({ data: filters }),
  });

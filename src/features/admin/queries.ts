import { queryOptions } from "@tanstack/react-query";

import { getActivityFeedFn, getAdminStatsFn, listActivityLogsFn } from "@/api/admin.functions";
import { listCodes } from "@/api/access-codes.functions";
import type { ActivityLogActionFilter, ActivityLogFeed } from "@/shared/schemas";

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
  action?: ActivityLogActionFilter | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page: number;
};

export const activityLogsQueryOptions = (filters: ActivityLogFilters) =>
  queryOptions({
    queryKey: ["activity-logs", filters],
    queryFn: () => listActivityLogsFn({ data: filters }),
  });

export const activityFeedQueryOptions = (feed: ActivityLogFeed) =>
  queryOptions({
    queryKey: ["activity-feed", feed],
    queryFn: () => getActivityFeedFn({ data: { feed } }),
  });

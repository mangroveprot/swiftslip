import { queryOptions } from "@tanstack/react-query";

import {
  getActivityFeedFn,
  getActivityLogCountsFn,
  getAdminStatsFn,
  listActivityLogsFn,
} from "@/api/admin.functions";
import { listCodes } from "@/api/access-codes.functions";
import { listOrgOptions } from "@/api/org-options.functions";
import type { ActivityLogActionFilter, ActivityLogFeed } from "@swiftslip/shared/schemas";

export const accessCodesQueryOptions = () =>
  queryOptions({
    queryKey: ["codes"],
    queryFn: () => listCodes(),
  });

export const orgOptionsQueryOptions = () =>
  queryOptions({
    queryKey: ["org-options"],
    queryFn: () => listOrgOptions(),
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
    // Audit history barely changes; cache for 5 minutes so page
    // navigation, tab switches, and reconnects don't hit the server again.
    staleTime: 5 * 60 * 1000,
    refetchOnReconnect: false,
  });

export type ActivityLogRange = { from?: string | undefined; to?: string | undefined };

export const activityLogCountsQueryOptions = (range: ActivityLogRange) =>
  queryOptions({
    queryKey: ["activity-log-counts", range],
    queryFn: () => getActivityLogCountsFn({ data: range }),
    // Tab counts change only when new rows arrive; cache longer.
    staleTime: 10 * 60 * 1000,
    refetchOnReconnect: false,
  });

export const activityFeedQueryOptions = (feed: ActivityLogFeed) =>
  queryOptions({
    queryKey: ["activity-feed", feed],
    queryFn: () => getActivityFeedFn({ data: { feed } }),
    // This is a "latest" view, so don't keep serving a cached page after an
    // admin change or after returning from another admin section.
    staleTime: 0,
    refetchOnReconnect: true,
  });

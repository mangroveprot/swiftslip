import { queryOptions } from "@tanstack/react-query";

import {
  getActivityFeedFn,
  getActivityLogCountsFn,
  getAdminStatsFn,
  listActivityLogsFn,
} from "@/api/admin.functions";
import { listCodes } from "@/api/access-codes.functions";
import { listOrgOptions } from "@/api/org-options.functions";
import {
  getRetentionSettings,
  getLastCleanupRun,
  previewRetentionCleanup,
} from "@/api/retention.functions";
import { getStorageOverview, previewStorageOrphans } from "@/api/storage.functions";
import {
  RETENTION_FORM_TYPES,
  RETENTION_MIN_DAYS,
  type ActivityLogActionFilter,
  type ActivityLogFeed,
  type StorageBackend,
} from "@swiftslip/shared/schemas";

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

export const retentionSettingsQueryOptions = () =>
  queryOptions({
    queryKey: ["retention-settings"],
    queryFn: () => getRetentionSettings(),
    // The setting changes only from this screen; a short staleTime keeps a
    // return trip instant without going stale for long.
    staleTime: 60 * 1000,
  });

export const lastCleanupRunQueryOptions = () =>
  queryOptions({
    queryKey: ["cleanup-run", "latest"],
    queryFn: () => getLastCleanupRun(),
    // A run is rare and momentous: always ask for the newest one.
    staleTime: 0,
  });

/**
 * What each form type holds past the keep period, for the by-type bars.
 *
 * It is the same read-only `POST /preview` the Preview button calls — posting
 * a draft so the counts follow the days on screen without saving them — and
 * it changes nothing. Kept separate from the button so opening the page shows
 * the piles immediately, while "Preview" still has to be pressed deliberately
 * before the cleanup unlocks.
 */
export const retentionCountsQueryOptions = (days: number) =>
  queryOptions({
    queryKey: ["retention-counts", days],
    queryFn: () =>
      previewRetentionCleanup({
        data: { settings: { enabled: true, days, formTypes: [...RETENTION_FORM_TYPES] } },
      }),
    enabled: Number.isInteger(days) && days >= RETENTION_MIN_DAYS,
    // Counting walks every expired row; a page revisit within five minutes
    // should not repeat that scan.
    staleTime: 5 * 60 * 1000,
  });

/**
 * The Storage page's overview. One key: the "Refresh usage" link re-fetches
 * with the server cache bypassed and writes the answer straight into this
 * entry, so the whole page updates without a second query.
 */
export const storageOverviewQueryOptions = () =>
  queryOptions({
    queryKey: ["storage-overview"],
    queryFn: () => getStorageOverview(),
    // The API caches usage for a minute anyway; a short staleTime keeps a
    // section switch instant without pretending the numbers never move.
    staleTime: 30 * 1000,
  });

/**
 * The orphan list the cleanup modal reviews. Fetched only while the modal is
 * open, and always fresh: the whole point is to show what would be deleted
 * right now, so a cached answer from an earlier open would defeat it.
 */
export const storageOrphansPreviewQueryOptions = (
  backend: StorageBackend | "everywhere",
  enabled: boolean,
) =>
  queryOptions({
    queryKey: ["storage-orphans-preview", backend],
    queryFn: () => previewStorageOrphans({ data: { backend } }),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });

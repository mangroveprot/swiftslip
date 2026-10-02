import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/server/auth/session.server";
import { listActivityFeed, listActivityLogs } from "@/server/services/activity-log.server";
import { getAdminStats } from "@/server/services/admin.server";
import { ACTIVITY_FEED_LIMIT, activityLogFeedInput, listActivityLogsInput } from "@/shared/schemas";

/** Admin-panel dashboard: totals and latest activity across the whole app. */
export const getAdminStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return await getAdminStats();
});

/** One filtered page of the audit trail — administrators only. */
export const listActivityLogsFn = createServerFn({ method: "GET" })
  .validator(listActivityLogsInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return await listActivityLogs(data);
  });

/** A dashboard side panel (security / form activity) — administrators only. */
export const getActivityFeedFn = createServerFn({ method: "GET" })
  .validator(activityLogFeedInput)
  .handler(async ({ data }) => {
    await requireAdmin();
    return await listActivityFeed(data.feed, ACTIVITY_FEED_LIMIT);
  });

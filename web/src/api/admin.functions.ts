import type { z } from "zod";

import { api, documentOf, documentsOf, seg } from "@/lib/api-client";
import type {
  ActiveSession,
  ActivityLogCounts,
  ActivityLogRow,
  AdminStats,
} from "@swiftslip/shared/api-types";
import type {
  activityLogFeedInput,
  activityLogRangeInput,
  listActivityLogsInput,
} from "@swiftslip/shared/schemas";

/** Admin-panel dashboard: totals and latest activity across the whole app. */
export const getAdminStatsFn = async () => documentOf(await api.get<AdminStats>("/admin/stats"));

/** One filtered page of the audit trail, administrators only. */
export const listActivityLogsFn = async ({
  data,
}: {
  data: z.input<typeof listActivityLogsInput>;
}) => {
  const response = await api.get<ActivityLogRow>("/activity-logs", data);
  return { rows: documentsOf(response), total: response.total ?? 0 };
};

/** Category counts for the log tabs, scoped to the selected date range. */
export const getActivityLogCountsFn = async ({
  data,
}: {
  data: z.input<typeof activityLogRangeInput>;
}) => documentOf(await api.get<ActivityLogCounts>("/activity-logs/counts", data));

/** A dashboard side panel (security / general activity). */
export const getActivityFeedFn = async ({ data }: { data: z.input<typeof activityLogFeedInput> }) =>
  documentsOf(await api.get<ActivityLogRow>("/activity-logs/feed", data));

/** Every live sign-in, newest activity first. Administrators only. */
export const listActiveSessionsFn = async () =>
  documentsOf(await api.get<ActiveSession>("/admin/sessions"));

/** End one session now; that device is signed out on its next request. */
export const revokeSessionFn = async (id: string) => {
  await api.delete(`/admin/sessions/${seg(id)}`);
  return { ok: true as const };
};

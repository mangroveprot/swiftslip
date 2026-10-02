import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/server/auth/session.server";
import { listActivityLogs } from "@/server/services/activity-log.server";
import { getAdminStats } from "@/server/services/admin.server";
import { listActivityLogsInput } from "@/shared/schemas";

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

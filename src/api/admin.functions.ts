import { createServerFn } from "@tanstack/react-start";

import { requireAdmin } from "@/server/auth/session.server";
import { getAdminStats } from "@/server/services/admin.server";

/** Admin-panel dashboard: totals and latest activity across the whole app. */
export const getAdminStatsFn = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  return await getAdminStats();
});

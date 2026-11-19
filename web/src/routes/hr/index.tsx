import { createFileRoute } from "@tanstack/react-router";

import { HrQueue, HR_STATUS_TAB_KEYS, type StatusTab } from "@/features/hr/components/HrQueue";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/hr/")({
  /**
   * The sidebar's Completed and Rejected rows are the same screen with a
   * filter, not second routes: one queue query, one cache entry, one place
   * to maintain. The status tab beside them is kept here too, so refreshing
   * the queue stays on the tab the reviewer was reading.
   */
  validateSearch: (
    search: Record<string, unknown>,
  ): { view?: "completed" | "rejected"; tab?: StatusTab } => {
    const view = search["view"];
    const tab = search["tab"];
    return {
      ...(view === "completed" || view === "rejected" ? { view } : {}),
      ...(typeof tab === "string" && (HR_STATUS_TAB_KEYS as readonly string[]).includes(tab)
        ? { tab: tab as StatusTab }
        : {}),
    };
  },
  head: () =>
    seo({
      title: pageTitle("HR Approvals"),
      description: "Official Business forms waiting for HR review, departure and arrival.",
    }),
  component: HrQueue,
});

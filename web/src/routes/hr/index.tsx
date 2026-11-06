import { createFileRoute } from "@tanstack/react-router";

import { HrQueue } from "@/features/hr/components/HrQueue";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/hr/")({
  /**
   * The sidebar's Completed and Rejected rows are the same screen with a
   * filter, not second routes: one queue query, one cache entry, one place
   * to maintain.
   */
  validateSearch: (search: Record<string, unknown>): { view?: "completed" | "rejected" } => {
    const view = search["view"];
    return view === "completed" || view === "rejected" ? { view } : {};
  },
  head: () =>
    seo({
      title: pageTitle("HR Approvals"),
      description: "Official Business forms waiting for HR review, departure and arrival.",
    }),
  component: HrQueue,
});

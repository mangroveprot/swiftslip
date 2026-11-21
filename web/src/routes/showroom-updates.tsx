import { createFileRoute, redirect } from "@tanstack/react-router";

import { ShowroomUpdatesPage } from "@/features/showroom-updates/pages/ShowroomUpdatesPage";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * Showroom Updates, its own app with its own chrome, outside `_app` on purpose
 * (no sidebar: the board is one page).
 *
 * `beforeLoad` gates the route; the API re-checks every request with
 * `requireApp('showroom-updates')`, so guessing the URL still hits a 403.
 */
export const Route = createFileRoute("/showroom-updates")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    if (!session.apps.includes("showroom-updates")) throw redirect({ to: "/records" });
  },
  head: () =>
    seo({
      title: pageTitle("Showroom Updates"),
      description: "Summary of SR status and updates: showroom readiness, requirements and owners.",
    }),
  component: ShowroomUpdatesPage,
});

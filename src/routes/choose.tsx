import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppChooser } from "@/features/auth/components/AppChooser";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * Post-login screen picker. Administrators choose between the existing
 * SwiftSlip portal and the (placeholder) RGC Asset Inventory app.
 * Sits outside `_app` so it renders without the sidebar shell.
 */
export const Route = createFileRoute("/choose")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    // Staff have a single app — send them straight to it.
    if (session.role !== "admin") throw redirect({ to: "/records" });
  },
  head: () =>
    seo({
      title: pageTitle("Choose a screen"),
      description: "Pick which application to open: SwiftSlip or RGC Asset Inventory.",
    }),
  component: AppChooser,
});

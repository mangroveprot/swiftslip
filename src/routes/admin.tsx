import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminPanel } from "@/features/admin/components/AdminPanel";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * Admin Panel — its own page with its own chrome, outside the SwiftSlip `_app`
 * shell. Admins reach it from the "Where would you like to go?" chooser card;
 * the portal's sidebar no longer carries admin navigation.
 */
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    if (session.role !== "admin") throw redirect({ to: "/records" });
  },
  head: () =>
    seo({
      title: pageTitle("Admin Panel"),
      description: "Dashboard, user management, settings and the Daily Time Record template.",
    }),
  component: AdminPanel,
});

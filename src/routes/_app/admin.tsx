import { createFileRoute, redirect } from "@tanstack/react-router";

import { AdminSettings } from "@/features/admin/components/AdminSettings";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/admin")({
  // `session` comes from the parent `_app` layout's beforeLoad.
  beforeLoad: ({ context }) => {
    if (context.session.role !== "admin") throw redirect({ to: "/records" });
  },
  head: () =>
    seo({
      title: pageTitle("Settings"),
      description: "Edit the Daily Time Record template and manage access passwords.",
    }),
  component: AdminSettings,
});

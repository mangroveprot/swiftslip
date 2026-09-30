import { createFileRoute, redirect } from "@tanstack/react-router";

import { InventoryLayout } from "@/features/inventory/components/InventoryLayout";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * RGC Asset Inventory — admin-gated shell with its own chrome (sidebar +
 * gradient header), outside `_app` on purpose. Child routes provide the
 * pages: index (assets), reports, settings.
 *
 * `beforeLoad` here gates every nested route, exactly like before.
 */
export const Route = createFileRoute("/rgc-asset-inventory")({
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
      title: pageTitle("RGC Asset Inventory"),
      description: "REGASCO deployed assets inventory — branches, floors, and reports.",
    }),
  component: InventoryLayout,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

import { AssetInventoryPlaceholder } from "@/features/inventory/components/AssetInventoryPlaceholder";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * RGC Asset Inventory — placeholder page (feature not built yet).
 * Outside `_app` on purpose: the inventory app will have its own chrome.
 * Admin-only, like the chooser that links to it — staff get sent to their records.
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
      description: "RGC Asset Inventory — coming soon.",
    }),
  component: AssetInventoryPlaceholder,
});

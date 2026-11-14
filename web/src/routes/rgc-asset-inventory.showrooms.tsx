import { createFileRoute } from "@tanstack/react-router";

import { InventoryShowroomsPage } from "@/features/inventory/pages/InventoryShowroomsPage";
import { pageTitle, seo } from "@/lib/seo";

/** `/rgc-asset-inventory/showrooms`, CCTV + internet status board. */
export const Route = createFileRoute("/rgc-asset-inventory/showrooms")({
  head: () =>
    seo({
      title: pageTitle("RGC Showrooms"),
      description: "Showroom CCTV and internet status across All branches.",
    }),
  component: InventoryShowroomsPage,
});

import { createFileRoute } from "@tanstack/react-router";

import { InventoryHomePage } from "@/features/inventory/pages/InventoryHomePage";
import { pageTitle, seo } from "@/lib/seo";

/** `/rgc-asset-inventory` — the assets table (original `Pages/Home.razor`). */
export const Route = createFileRoute("/rgc-asset-inventory/")({
  head: () =>
    seo({
      title: pageTitle("Assets — RGC Inventory"),
      description: "Browse, filter, and manage REGASCO's deployed assets.",
    }),
  component: InventoryHomePage,
});

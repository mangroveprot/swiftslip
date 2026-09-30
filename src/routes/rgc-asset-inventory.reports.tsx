import { createFileRoute } from "@tanstack/react-router";

import { InventoryReportsPage } from "@/features/inventory/pages/InventoryReportsPage";
import { pageTitle, seo } from "@/lib/seo";

/** `/rgc-asset-inventory/reports` — report preview + Excel export. */
export const Route = createFileRoute("/rgc-asset-inventory/reports")({
  head: () =>
    seo({
      title: pageTitle("Reports — RGC Inventory"),
      description: "Branch inventory report preview and Excel download.",
    }),
  component: InventoryReportsPage,
});

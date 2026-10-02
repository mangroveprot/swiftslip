import { createFileRoute } from "@tanstack/react-router";

import { InventorySettingsPage } from "@/features/inventory/pages/InventorySettingsPage";
import { pageTitle, seo } from "@/lib/seo";

/** `/rgc-asset-inventory/settings` — lookup-option management. */
export const Route = createFileRoute("/rgc-asset-inventory/settings")({
  head: () =>
    seo({
      title: pageTitle("Settings RGC Inventory"),
      description: "Manage lookup options used on inventory assets.",
    }),
  component: InventorySettingsPage,
});

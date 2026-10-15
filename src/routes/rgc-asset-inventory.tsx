import { createFileRoute, redirect } from "@tanstack/react-router";

import { InventoryLayout } from "@/features/inventory/components/InventoryLayout";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * RGC Asset Inventory — its own chrome (sidebar + gradient header), outside
 * `_app` on purpose. Child routes provide the pages: index (assets), reports,
 * settings.
 *
 * `beforeLoad` here gates every nested route. Access is a GRANT, not a role:
 * admins hold it automatically, and a non-admin can be granted it from the
 * Admin Panel → App access rules. `session.apps` comes from `getSession`,
 * which resolves it from the database on every read.
 *
 * This route guard is UX, not the security boundary — the server functions in
 * `api/inventory.functions.ts` each re-check with `requireApp`, so guessing the
 * URL still hits a 403 at the data layer.
 */
export const Route = createFileRoute("/rgc-asset-inventory")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    if (!session.apps.includes("inventory")) throw redirect({ to: "/records" });
  },
  head: () =>
    seo({
      title: pageTitle("RGC Asset Inventory"),
      description: "REGASCO deployed assets inventory: branches, floors, and reports etc.",
    }),
  component: InventoryLayout,
});

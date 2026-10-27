import { createFileRoute, redirect } from "@tanstack/react-router";

import { AppChooser } from "@/features/auth/components/AppChooser";
import { sessionQueryOptions } from "@/features/auth/queries";
import { pageTitle, seo } from "@/lib/seo";
import { APP_HOME, isExternalApp, type AppKey, type InternalAppKey } from "@swiftslip/shared/types";

/**
 * Post-login screen picker. Shown only when there is an actual choice to make.
 * Sits outside `_app` so it renders without the sidebar shell.
 *
 * With one app granted there is nothing to choose, so the user is sent straight
 * there instead — which is the common case for staff now that access is a
 * grant rather than a role. An app on another host has no route here, so it is
 * always shown in the chooser and opened by the card's own link.
 */
export const Route = createFileRoute("/choose")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    const apps: AppKey[] = session.apps?.length ? session.apps : ["swiftslip"];
    const only = apps.length === 1 ? apps[0] : undefined;
    if (only && !isExternalApp(only)) throw redirect({ to: APP_HOME[only as InternalAppKey] });
  },
  head: () =>
    seo({
      title: pageTitle("Choose a screen"),
      description:
        "Pick where to go: SwiftSlip, the Admin Panel, RGC Asset Inventory or the Regasco Ticketing System.",
    }),
  component: AppChooser,
});

import { createFileRoute, redirect } from "@tanstack/react-router";

import { HrLayout } from "@/features/hr/components/HrLayout";
import { sessionQueryOptions } from "@/features/auth/queries";
import { loadProfileForGate, needsOnboarding } from "@/features/profile/onboarding";
import { pageTitle, seo } from "@/lib/seo";

/**
 * The HR app — its own shell, outside `_app` on purpose (D1). The guard is UX;
 * every HR endpoint re-checks with `requireApp('hr')` on the server.
 */
export const Route = createFileRoute("/hr")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    const profile = await loadProfileForGate(context.queryClient);
    if (profile && needsOnboarding(session.id, profile)) {
      throw redirect({ to: "/onboarding" });
    }
    if (!session.apps.includes("hr")) throw redirect({ to: "/choose" });
  },
  head: () =>
    seo({
      title: pageTitle("HR Approvals"),
      description: "Review and sign Official Business forms submitted by employees.",
    }),
  component: HrLayout,
});

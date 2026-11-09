import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/AppShell";
import { sessionQueryOptions } from "@/features/auth/queries";
import { loadProfileForGate, needsOnboarding } from "@/features/profile/onboarding";

/**
 * Pathless layout route: every page inside `routes/_app/` requires a session
 * and is rendered inside the app chrome. No per-page guards or wrappers needed.
 */
export const Route = createFileRoute("/_app")({
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
    return { session };
  },
  component: AppLayout,
});

function AppLayout() {
  const { session } = Route.useRouteContext();
  return (
    <AppShell session={session}>
      <Outlet />
    </AppShell>
  );
}

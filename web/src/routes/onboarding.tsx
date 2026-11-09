import { createFileRoute, redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "@/features/auth/queries";
import { OnboardingFlow } from "@/features/profile/components/OnboardingFlow";
import { needsOnboarding } from "@/features/profile/onboarding";
import { profileQueryOptions } from "@/features/profile/queries";
import { pageTitle, seo } from "@/lib/seo";

/**
 * Shown at sign-in while the profile still has gaps. Outside the app shell so
 * the welcome is the whole page. Skipping only silences the welcome for this
 * sign-in; leaving it returns to `/choose`, which picks the app or shows the
 * picker just as it does on a normal sign-in.
 */
export const Route = createFileRoute("/onboarding")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (!session) throw redirect({ to: "/" });
    let profile;
    try {
      profile = await context.queryClient.ensureQueryData(profileQueryOptions());
    } catch {
      throw redirect({ to: "/records" });
    }
    if (!needsOnboarding(session.id, profile)) {
      throw redirect({ to: "/records" });
    }
    return { session };
  },
  head: () =>
    seo({
      title: pageTitle("Welcome"),
      description: "Add the name, work details and signature that fill in your forms.",
    }),
  component: OnboardingPage,
});

function OnboardingPage() {
  const { session } = Route.useRouteContext();
  return <OnboardingFlow session={session} />;
}

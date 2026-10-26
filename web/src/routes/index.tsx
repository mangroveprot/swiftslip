import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginForm } from "@/features/auth/components/LoginForm";
import { sessionQueryOptions } from "@/features/auth/queries";
import { seo, pageTitle } from "@/lib/seo";

export const Route = createFileRoute("/")({
  // Already signed in? Skip the login page — /choose takes it from there:
  // one granted app redirects straight in, several show the picker.
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData({
      ...sessionQueryOptions(),
      revalidateIfStale: true,
    });
    if (session) {
      throw redirect({ to: "/choose" });
    }
  },
  head: () =>
    seo({
      title: pageTitle("Daily Time Records"),
      description:
        "Password-protected Daily Time Record portal with biometric log import, printing and download.",
    }),
  component: LoginForm,
});

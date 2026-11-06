import { createFileRoute } from "@tanstack/react-router";

import { ProfileForm } from "@/features/profile/components/ProfileForm";
import { pageTitle, seo } from "@/lib/seo";

/**
 * The HR app's own copy of My Account. Same data and component as
 * `/_app/profile`, but rendered inside HrLayout so the sidebar does not jump
 * back to the main SwiftSlip shell.
 */
export const Route = createFileRoute("/hr/profile")({
  head: () =>
    seo({
      title: pageTitle("My Account"),
      description: "Your employee details used on Daily Time Records.",
    }),
  component: ProfileForm,
});

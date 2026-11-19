import { createFileRoute } from "@tanstack/react-router";

import { ProfileForm } from "@/features/profile/components/ProfileForm";
import { pageTitle, seo } from "@/lib/seo";

/**
 * The Admin Panel's own copy of My Account. Same data and component as
 * `/_app/profile`, but rendered inside the panel's chrome: opening it from the
 * admin sidebar must not jump back to the employee SwiftSlip app.
 *
 * The panel's `routes/admin.tsx` guard runs for this child too, so only an
 * admin can reach it.
 */
export const Route = createFileRoute("/admin/profile")({
  head: () =>
    seo({
      title: pageTitle("My Account"),
      description: "Your employee details used on Daily Time Records.",
    }),
  component: ProfileForm,
});

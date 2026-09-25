import { createFileRoute } from "@tanstack/react-router";

import { ProfileForm } from "@/features/profile/components/ProfileForm";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/profile")({
  head: () =>
    seo({
      title: pageTitle("Profile"),
      description: "Your employee details used on Daily Time Records.",
    }),
  component: ProfileForm,
});

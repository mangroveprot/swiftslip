import { createFileRoute } from "@tanstack/react-router";

import { CosList } from "@/features/change-of-schedule/components/CosList";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/change-of-schedule/")({
  head: () =>
    seo({
      title: pageTitle("Change of Schedule forms"),
      description: "Browse, open and print saved Change of Schedule forms.",
    }),
  component: CosList,
});

import { createFileRoute } from "@tanstack/react-router";

import { RecordsList } from "@/features/records/components/RecordsList";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/records/")({
  head: () =>
    seo({
      title: pageTitle("Time records"),
      description: "Browse, open and print saved Daily Time Records.",
    }),
  component: RecordsList,
});

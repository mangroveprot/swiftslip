import { createFileRoute } from "@tanstack/react-router";

import { OtList } from "@/features/overtime/components/OtList";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/overtime/")({
  head: () =>
    seo({
      title: pageTitle("Overtime forms"),
      description: "Browse, open and print saved Overtime authorization forms.",
    }),
  component: OtList,
});

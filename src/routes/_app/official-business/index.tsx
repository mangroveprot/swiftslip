import { createFileRoute } from "@tanstack/react-router";

import { ObList } from "@/features/official-business/components/ObList";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/official-business/")({
  head: () =>
    seo({
      title: pageTitle("Official Business forms"),
      description: "Browse, open and print saved Official Business forms.",
    }),
  component: ObList,
});

import { createFileRoute } from "@tanstack/react-router";

import { LoaList } from "@/features/leave-of-absence/components/LoaList";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/leave-of-absence/")({
  head: () =>
    seo({
      title: pageTitle("Leave of Absence forms"),
      description: "Browse, open and print saved Leave of Absence forms.",
    }),
  component: LoaList,
});

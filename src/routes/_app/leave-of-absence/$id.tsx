import { createFileRoute } from "@tanstack/react-router";

import { LoaEditor } from "@/features/leave-of-absence/components/LoaEditor";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/leave-of-absence/$id")({
  head: () =>
    seo({
      title: pageTitle("Leave of Absence Form"),
      description: "Fill in the Leave of Absence form and preview the printed sheet live.",
    }),
  component: LoaFormPage,
});

function LoaFormPage() {
  const { id } = Route.useParams();
  // The editor picks its own instance key: it stays mounted across its own
  // draft→real save and swaps only when the param points at another record.
  return <LoaEditor id={id} />;
}

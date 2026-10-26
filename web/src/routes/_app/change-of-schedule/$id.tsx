import { createFileRoute } from "@tanstack/react-router";

import { CosEditor } from "@/features/change-of-schedule/components/CosEditor";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/change-of-schedule/$id")({
  head: () =>
    seo({
      title: pageTitle("Change of Schedule Form"),
      description: "Fill in the Change of Schedule form and preview the printed sheet live.",
    }),
  component: CosFormPage,
});

function CosFormPage() {
  const { id } = Route.useParams();
  // The editor picks its own instance key: it stays mounted across its own
  // draft→real save and swaps only when the param points at another record.
  return <CosEditor id={id} />;
}

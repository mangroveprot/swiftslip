import { createFileRoute } from "@tanstack/react-router";

import { ObEditor } from "@/features/official-business/components/ObEditor";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/official-business/$id")({
  head: () =>
    seo({
      title: pageTitle("Official Business Form"),
      description: "Fill in the Official Business form and preview the printed sheet live.",
    }),
  component: ObFormPage,
});

function ObFormPage() {
  const { id } = Route.useParams();
  // The editor picks its own instance key: it stays mounted across its own
  // draft→real save and swaps only when the param points at another record.
  return <ObEditor id={id} />;
}

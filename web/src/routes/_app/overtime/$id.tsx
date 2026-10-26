import { createFileRoute } from "@tanstack/react-router";

import { OtEditor } from "@/features/overtime/components/OtEditor";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/overtime/$id")({
  head: () =>
    seo({
      title: pageTitle("Overtime Authorization Form"),
      description: "Fill in the Overtime form and preview the printed sheet live.",
    }),
  component: OtFormPage,
});

function OtFormPage() {
  const { id } = Route.useParams();
  // The editor picks its own instance key: it stays mounted across its own
  // draft→real save and swaps only when the param points at another record.
  return <OtEditor id={id} />;
}

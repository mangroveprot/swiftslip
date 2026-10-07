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
  return <CosEditor id={id} />;
}

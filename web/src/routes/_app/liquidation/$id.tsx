import { createFileRoute } from "@tanstack/react-router";

import { LiqEditor } from "@/features/liquidation/components/LiqEditor";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/liquidation/$id")({
  head: () =>
    seo({
      title: pageTitle("Statement of Liquidation"),
      description: "Fill in the Statement of Liquidation and preview the printed sheet live.",
    }),
  component: LiqFormPage,
});

function LiqFormPage() {
  const { id } = Route.useParams();
  return <LiqEditor id={id} />;
}

import { createFileRoute } from "@tanstack/react-router";

import { RecordEditor } from "@/features/records/components/RecordEditor";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/records/$id")({
  head: () =>
    seo({
      title: pageTitle("Daily Time Record sheet"),
      description:
        "Fill in the Daily Time Record, import biometric logs and preview the printed sheet live.",
    }),
  component: RecordPage,
});

function RecordPage() {
  const { id } = Route.useParams();
  return <RecordEditor id={id} />;
}

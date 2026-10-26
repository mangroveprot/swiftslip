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
  // The editor picks its own instance key: it stays mounted across its own
  // draft→real save and swaps only when the param points at another record —
  // see the comment on `RecordEditor`.
  return <RecordEditor id={id} />;
}

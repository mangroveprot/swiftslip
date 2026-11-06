import { createFileRoute } from "@tanstack/react-router";

import { HrObDetailPage } from "@/features/hr/components/HrObDetailPage";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/hr/ob/$id")({
  head: () =>
    seo({
      title: pageTitle("OB review"),
      description: "Approve, reject or sign an Official Business form.",
    }),
  component: HrObPage,
});

function HrObPage() {
  const { id } = Route.useParams();
  return <HrObDetailPage id={id} />;
}

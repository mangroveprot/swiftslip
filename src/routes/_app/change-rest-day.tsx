import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/common/ComingSoon";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/change-rest-day")({
  head: () =>
    seo({
      title: pageTitle("Notice of Change Rest Day"),
      description: "Prepare a Notice of Change Rest Day Schedule form for an employee.",
    }),
  component: () => (
    <ComingSoon
      eyebrow="Notice form"
      title="Change Rest Day"
      description="This form will mirror the Notice of Change Rest Day Schedule sheet: previous and present rest days, effectivity dates, reasons, and the submitted / approved / noted signature blocks."
    />
  ),
});

import { createFileRoute } from "@tanstack/react-router";

import { ComingSoon } from "@/components/common/ComingSoon";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/change-time-schedule")({
  head: () =>
    seo({
      title: pageTitle("Notice of Change Time Schedule"),
      description: "Prepare a Notice of Change Time Schedule form for an employee.",
    }),
  component: () => (
    <ComingSoon
      eyebrow="Notice form"
      title="Change Time Schedule"
      description="This form will mirror the Notice of Change Time Schedule sheet: previous and present IN/OUT times, effectivity dates, reasons, and the submitted / approved / noted signature blocks."
    />
  ),
});

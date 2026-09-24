import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/change-time-schedule")({
  head: () => ({
    meta: [
      { title: "Notice of Change Time Schedule — SwiftSlip" },
      { name: "description", content: "Prepare a Notice of Change Time Schedule form for an employee." },
      { property: "og:title", content: "Notice of Change Time Schedule — SwiftSlip" },
      { property: "og:description", content: "Prepare a Notice of Change Time Schedule form for an employee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ComingSoon
        eyebrow="Notice form"
        title="Change Time Schedule"
        description="This form will mirror the Notice of Change Time Schedule sheet: previous and present IN/OUT times, effectivity dates, reasons, and the submitted / approved / noted signature blocks."
      />
    </AppShell>
  ),
});

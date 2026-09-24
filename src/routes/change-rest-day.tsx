import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { ComingSoon } from "@/components/ComingSoon";

export const Route = createFileRoute("/change-rest-day")({
  head: () => ({
    meta: [
      { title: "Notice of Change Rest Day — SwiftSlip" },
      { name: "description", content: "Prepare a Notice of Change Rest Day Schedule form for an employee." },
      { property: "og:title", content: "Notice of Change Rest Day — SwiftSlip" },
      { property: "og:description", content: "Prepare a Notice of Change Rest Day Schedule form for an employee." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <AppShell>
      <ComingSoon
        eyebrow="Notice form"
        title="Change Rest Day"
        description="This form will mirror the Notice of Change Rest Day Schedule sheet: previous and present rest days, effectivity dates, reasons, and the submitted / approved / noted signature blocks."
      />
    </AppShell>
  ),
});

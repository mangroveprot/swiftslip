import { createFileRoute } from "@tanstack/react-router";

import { LiqList } from "@/features/liquidation/components/LiqList";
import { pageTitle, seo } from "@/lib/seo";

export const Route = createFileRoute("/_app/liquidation/")({
  head: () =>
    seo({
      title: pageTitle("Statement of Liquidation forms"),
      description: "Browse, open and print saved Statements of Liquidation.",
    }),
  component: LiqList,
});

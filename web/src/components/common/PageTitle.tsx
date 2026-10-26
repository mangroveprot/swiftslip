import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The one page-heading recipe for SwiftSlip.
 *
 * Screens used to pick their own heading style: the Official Business list was
 * `text-3xl font-bold tracking-tight`, every other list was a plain (not bold)
 * `text-4xl`, and nothing stepped down for phones — so a title like
 * "Change of Schedule" filled half a mobile screen and wrapped across three
 * lines.
 *
 * Every page heading now shares this: bold and tight-tracked like the OB look,
 * 24px until `sm`, then back up to the size that page always had —
 * `size="xl"` (36px) for the big list titles, `size="lg"` (30px, the default)
 * for everything else.
 *
 * `as` keeps the document outline intact for the admin sections, which head
 * their cards with an `h2`.
 */
export function PageTitle({
  children,
  className,
  size = "lg",
  as: Tag = "h1",
}: {
  children: ReactNode;
  className?: string;
  /** `lg` steps to 30px from `sm`, `xl` to 36px. Phones get 24px either way. */
  size?: "lg" | "xl";
  as?: ElementType;
}) {
  return (
    <Tag
      className={cn(
        "text-2xl font-bold tracking-tight sm:text-3xl",
        size === "xl" && "sm:text-4xl",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

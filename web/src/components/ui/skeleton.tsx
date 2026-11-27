import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  // `foreground`, not `muted`: in dark mode `--muted` sits a hair above
  // `--card`, so a muted bar was invisible on the card it was drawn on.
  return <div className={cn("animate-pulse rounded-md bg-foreground/20", className)} {...props} />;
}

export { Skeleton };

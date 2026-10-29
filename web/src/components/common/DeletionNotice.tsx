import { Timer } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "This form is about to go" badge for a form card.
 *
 * `days` comes from the API (`deletes_in_days`) and is only present when a
 * retention cleanup would take the form within the next week — or already
 * would, on the next run. It is a warning, not a promise: nothing is deleted
 * until an admin previews and runs a cleanup, so the wording stays vague about
 * the moment and precise about the fact.
 */
export function DeletionNotice({
  days,
  className,
}: {
  days?: number | undefined;
  className?: string;
}) {
  if (typeof days !== "number") return null;

  const due = days <= 0;
  const when = `day${days === 1 ? "" : "s"}`;

  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        due
          ? "border-destructive/35 bg-destructive/10 text-destructive"
          : "border-logo/35 bg-logo/10 text-logo-ink",
        className,
      )}
      title={
        due
          ? "Old enough for the next data-retention cleanup. An admin still has to preview and run it."
          : `Reaches the retention age in ${days} ${when}. The next cleanup can then delete it and its files.`
      }
    >
      <Timer className="size-3 shrink-0" aria-hidden="true" />
      {due ? "Due for deletion" : `Deletes in ${days} ${when}`}
    </span>
  );
}

import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Approval status pill. OB forms read it off the ticked approval slip; DTR
 * records count as approved once a supporting file is attached (they have no
 * approval flag of their own). Red when there is nothing to approve yet.
 */
export function ApprovedBadge({ approved, className }: { approved: boolean; className?: string }) {
  return approved ? (
    <span
      className={cn(
        // `w-fit` keeps the pill hugging its text even in a flex-col card,
        // so OB and DTR cards render it identically.
        "inline-flex w-fit items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700",
        className,
      )}
    >
      <CheckCircle2 className="size-3.5" aria-hidden="true" />
      Approved
    </span>
  ) : (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700",
        className,
      )}
    >
      <XCircle className="size-3.5" aria-hidden="true" />
      Not Approved
    </span>
  );
}

import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { obResubmitLine, type ObResubmitEvent } from "@swiftslip/shared/hr";

/**
 * "Resubmitted after rejection", the one line that tells a reviewer (or the
 * employee) this form has been through HR before. The count comes from
 * `ob_forms.resubmit_count` (migration 0037) and the wording from the latest
 * `resubmit_history` entry, which the API increments on both routes back into
 * the queue: a rejected form resubmitted, or content edited after HR approved.
 *
 * Plain text, not a pill, the reference's lists read as records. Shared by the
 * employee's card list and the status card so the screens never disagree.
 */
export function ResubmitBadge({
  count,
  history,
  className,
  label,
}: {
  /** 0 / undefined renders nothing, a first submission earns no line. */
  count: number | null | undefined;
  /** The trips back to HR, oldest first, the latest supplies the wording. */
  history?: readonly ObResubmitEvent[] | null | undefined;
  className?: string;
  /** Override the derived wording on tight rows. */
  label?: string;
}) {
  const times = count ?? 0;
  if (times <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400",
        className,
      )}
      title={`This form has gone back to HR ${times} time${times === 1 ? "" : "s"}`}
    >
      <RotateCcw className="size-3 shrink-0" aria-hidden="true" />
      {label ?? obResubmitLine(times, history) ?? `Resubmitted ×${times}`}
    </span>
  );
}

import { cn } from "@/lib/utils";

/**
 * The quiet last line of a form card: when it was last edited, and — inside
 * the retention reminder window — when it becomes old enough for the next
 * cleanup.
 *
 * One line, no icons, no pill: the previous card carried a clock in a tinted
 * "Deletes in 7 days" pill and a second clock on the "Updated" line below it.
 * Both dates now sit together in one muted line, and the deletion half only
 * raises its voice when it has to:
 *
 *   > 3 days   Updated Oct 22 · Deletes Nov 21   (muted, fixed date)
 *   ≤ 3 days   Updated Oct 22 · Deletes in 3 days (amber words only)
 *   tomorrow   Updated Oct 22 · Deletes tomorrow   (red words only)
 *
 * A date is used while there is time, because "in 7 days" changes meaning
 * every time the card is read; the last three days switch to relative words,
 * which are the point. `deletes_at` comes from the API so the printed date is
 * the real age milestone, not "today + N".
 */

/** "Oct 22", plus the year only when it is not this year. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/** "Deletes Nov 21" / "Deletes in 3 days" / "Deletes tomorrow". */
function deletionText(days: number, deletesAt: string | undefined): string {
  if (days <= 0) return "Due for deletion";
  if (days === 1) return "Deletes tomorrow";
  if (days <= 3) return `Deletes in ${days} days`;
  return deletesAt ? `Deletes ${shortDate(deletesAt)}` : `Deletes in ${days} days`;
}

/**
 * Only the deletion words take a tone: muted while there is time, amber in the
 * last three days, red tomorrow. Wording changes with the tone as well, so the
 * warning never depends on colour alone.
 */
function deletionTone(days: number): string {
  if (days <= 1) return "text-destructive";
  if (days <= 3) return "text-logo-ink";
  return "";
}

function deletionTitle(days: number, deletesAt: string | undefined): string {
  if (days <= 0) {
    return "Old enough for the next data-retention cleanup. An admin still has to preview and run it.";
  }
  if (deletesAt) {
    return `Reaches the retention age on ${shortDate(deletesAt)}. The next cleanup can then delete it and its files.`;
  }
  return `Reaches the retention age in ${days} ${days === 1 ? "day" : "days"}. The next cleanup can then delete it and its files.`;
}

export function FormCardMeta({
  updatedAt,
  deletesInDays,
  deletesAt,
  className,
}: {
  updatedAt?: string | null | undefined;
  deletesInDays?: number | null | undefined;
  deletesAt?: string | null | undefined;
  className?: string | undefined;
}) {
  const hasUpdated = typeof updatedAt === "string" && updatedAt.length > 0;
  const hasDeletion = typeof deletesInDays === "number";
  if (!hasUpdated && !hasDeletion) return null;

  return (
    <p
      className={cn(
        "flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {hasUpdated ? (
        <span className="whitespace-nowrap" title={new Date(updatedAt).toLocaleString()}>
          Updated {shortDate(updatedAt)}
        </span>
      ) : null}
      {hasUpdated && hasDeletion ? <span aria-hidden="true">·</span> : null}
      {hasDeletion ? (
        <span
          className={cn("whitespace-nowrap", deletionTone(deletesInDays))}
          title={deletionTitle(deletesInDays, deletesAt ?? undefined)}
        >
          {deletionText(deletesInDays, deletesAt ?? undefined)}
        </span>
      ) : null}
    </p>
  );
}

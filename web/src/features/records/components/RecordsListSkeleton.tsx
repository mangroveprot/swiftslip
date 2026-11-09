import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for the Time Records card grid while the list query loads.
 *
 * `ListSkeleton` draws a generic two-line card, but `RecordCard` now has the
 * Open / Delete pair beside the name, a period line, an "Updated …" line and
 * the little DTR sheet thumbnail on the right. Matching those fixed blocks keeps
 * the grid from reshuffling when the records arrive. Conditional extras (the
 * deletion notice and the APPROVED seal) are deliberately left out — they add
 * no height and only appear on some records.
 */
export function RecordsListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="relative flex gap-3 rounded-xl border bg-card p-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Skeleton className="h-7 w-16 rounded-md" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </div>
            <Skeleton className="mt-3 h-3 w-1/2" />
            <Skeleton className="mt-1.5 h-3 w-2/5" />
          </div>

          {/* The mini DTR sheet: a title bar and six ruled lines. */}
          <div className="h-[6.25rem] w-[4.75rem] shrink-0 space-y-1 rounded-sm border bg-paper p-1.5 shadow-sm">
            <Skeleton className="h-1.5 w-full" />
            {Array.from({ length: 6 }).map((_, j) => (
              <Skeleton key={j} className="h-0.5 w-full rounded-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

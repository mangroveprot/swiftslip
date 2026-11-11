import { Skeleton } from "@/components/ui/skeleton";

/** Stand-in for the editor while its row loads: the form card on the left and
 *  a landscape sheet on the right, at the editor's own column widths. */
export function LiqEditorSkeleton() {
  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-6 md:py-5 lg:h-full lg:overflow-hidden">
      <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="mt-2 h-8 w-72" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
        <div className="rounded-xl bg-card p-6">
          <Skeleton className="h-4 w-40" />
          <div className="mt-6 grid grid-cols-2 gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-9 w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="mt-6 h-24 w-full" />
        </div>
        <div className="min-h-0">
          <Skeleton className="aspect-[1204/536] w-full rounded-sm" />
        </div>
      </div>
    </main>
  );
}

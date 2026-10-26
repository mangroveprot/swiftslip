import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for the OB editor while its row loads: the same shell the real form
 * paints — back link and title over Export/Save, the borderless sheet on the
 * left (identity block, dates row, itinerary, signature) and the attachment,
 * approval tick and preview paper on the right — at the same column widths, so
 * nothing moves when the data lands.
 */
export function ObEditorSkeleton() {
  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-6 md:py-5 lg:h-full lg:overflow-hidden">
      <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-2 h-8 w-72" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="@container min-h-0 rounded-xl bg-card p-5 sm:p-6 lg:overflow-y-auto lg:p-8">
          {/* Identity block — four values across, as the sheet lays them out. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="min-w-0 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>

          <div className="mt-6 border-t pt-5">
            <div className="grid items-end gap-4 @md:grid-cols-3">
              {["w-24", "w-24", "w-44"].map((w, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className={`h-3 ${w}`} />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-9 w-24" />
            </div>
            <div className="mt-4 grid gap-4 @md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3 w-24" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
            <div className="mt-4 grid gap-4 @md:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t pt-5">
            <Skeleton className="h-4 w-40" />
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-9 w-32 rounded-md" />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <section className="relative shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <Skeleton className="h-3 w-36" />
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-28" />
              <div className="flex items-start gap-3">
                <Skeleton className="h-24 w-32 rounded" />
                <div className="flex gap-1.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="size-7 rounded-md" />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <Skeleton className="h-4 w-24" />

          <div className="flex shrink-0 items-center justify-between gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="size-7 rounded-md" />
          </div>

          <div className="min-h-0 lg:flex-1 lg:overflow-auto">
            <div className="mx-auto w-full bg-paper px-6 pb-6 pt-1 shadow-sm ring-1 ring-border">
              <div className="flex flex-col items-center gap-2 py-4">
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-4 w-52" />
              </div>
              <div className="grid grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="space-y-1.5 border border-ink/60 p-2">
                    <Skeleton className="h-2.5 w-16" />
                    <Skeleton className="h-3.5 w-24" />
                  </div>
                ))}
              </div>
              <div className="h-3" />
              <div className="border border-ink/60">
                <div className="grid grid-cols-4 bg-muted">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="border border-ink/40 p-2">
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-4 border-t border-ink/40">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="border-r border-ink/40 p-2 last:border-r-0">
                        <Skeleton className="h-3 w-full" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

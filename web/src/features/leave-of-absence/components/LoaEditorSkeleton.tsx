import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for the LOA editor while its row loads: the same shell the real
 * form paints — back link and title over Export/Save, the borderless sheet on
 * the left (status line, identity row, the field grid, signature) with the
 * supporting-files card under it, and the attachment, preview label and A4
 * paper on the right — at the editor's own column widths, so nothing moves
 * when the data lands.
 */
export function LoaEditorSkeleton() {
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

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="flex min-h-0 flex-col gap-6 lg:overflow-auto">
          <section className="form-fill @container shrink-0 rounded-xl bg-card p-5 sm:p-6 lg:p-8">
            {/* Title row: the box's own label and the "still needed" line. */}
            <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="mb-3 h-4 w-full" />

            {/* Identity row — four values across, as the sheet lays them out. */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="min-w-0 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
            </div>

            <div className="mt-6 border-t pt-5">
              <div className="grid gap-3 @min-[26rem]:grid-cols-2 @min-[44rem]:grid-cols-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                ))}
                <div className="@min-[26rem]:col-span-2 @min-[44rem]:col-span-4">
                  <Skeleton className="mb-2 h-3 w-40" />
                  <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <Skeleton key={i} className="h-3.5 w-24" />
                    ))}
                  </div>
                </div>
                <div className="@min-[26rem]:col-span-2 @min-[44rem]:col-span-4">
                  <Skeleton className="mb-2 h-3 w-32" />
                  <Skeleton className="h-16 w-full rounded-md" />
                </div>
              </div>
            </div>

            <div className="mt-6 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-9 w-32 rounded-md" />
                </div>
              </div>
            </div>
          </section>

          <section className="shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-9 w-full rounded-md" />
          </section>
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
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="size-7 rounded-md" />
          </div>

          <div className="min-h-0 overflow-x-hidden rounded-sm lg:flex-1 lg:overflow-y-auto">
            <div className="mx-auto w-full bg-paper px-6 pb-6 pt-4 shadow-sm ring-1 ring-border">
              <div className="space-y-2">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-3 w-72" />
                <Skeleton className="h-3 w-64" />
              </div>
              <div className="mt-5 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                ))}
              </div>
              <div className="mt-6 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

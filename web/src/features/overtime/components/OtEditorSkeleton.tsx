import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for the OT editor while its row loads: the same shell the real form
 * paints — back link and title over Export/Save, the borderless sheet on the
 * left (identity row, the date box, the Overtime block, reason, the three
 * sign-off boxes and the signature) with the scrollbar on the card itself, and
 * the attachment, preview label, A4 paper and supporting-files card on the
 * right — at the editor's own column widths, so nothing shifts when the data
 * lands.
 */
export function OtEditorSkeleton() {
  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-6 md:py-5 lg:h-full lg:overflow-hidden">
      <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-8 w-80" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="no-print form-fill @container min-h-0 rounded-l-xl bg-card p-5 sm:p-6 lg:overflow-y-auto lg:p-8">
          {/* Identity row — four values across, as the sheet lays them out. */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="min-w-0 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>

          {/* Date & Time Filed, capped at a header box's width. */}
          <div className="mt-6 border-t pt-5">
            <div className="max-w-sm space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </div>

          {/* Overtime: heading, Add date, then one line block. */}
          <div className="mt-6 border-t pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-28" />
            </div>
            <div className="mt-4 rounded-lg border border-dashed bg-background/50 px-4 py-8">
              <Skeleton className="mx-auto h-4 w-72" />
            </div>
          </div>

          {/* Reason, then the three sign-off boxes. */}
          <div className="mt-6 border-t pt-5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-40" />
              <div className="flex gap-1">
                <Skeleton className="h-6 w-20 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          </div>

          {/* Signature row. */}
          <div className="mt-6 border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-40" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>
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

          <div className="flex shrink-0 items-center justify-between gap-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="size-7 rounded-md" />
          </div>

          <div className="min-h-0 overflow-hidden rounded-sm lg:flex-1 lg:overflow-auto">
            <div className="mx-auto w-full bg-paper px-6 pb-6 pt-4 shadow-sm ring-1 ring-border">
              <div className="space-y-2">
                <Skeleton className="h-5 w-72" />
                <Skeleton className="h-3 w-64" />
              </div>
              <div className="mt-5 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-3 w-24" />
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

          {/* The supporting-files card, under the preview where the real form
              now puts it. */}
          <section className="shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="mt-3 h-9 w-full rounded-md" />
          </section>
        </div>
      </div>
    </main>
  );
}

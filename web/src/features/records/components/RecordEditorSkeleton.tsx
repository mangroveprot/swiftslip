import { Skeleton } from "@/components/ui/skeleton";

/**
 * Stand-in for the DTR editor while its row loads.
 *
 * Every other form editor has its own skeleton; this one used to share the old
 * generic `EditorSkeleton`, which still drew the pre-card-stack page (a small
 * toolbar, one 6-field card, one 8-row card and a narrow strip of lines on the
 * right). The real DTR now has three stacked cards in the form column — record
 * details, the daily-entries table, other attachments — and an attachment card,
 * a "Live preview" row and the A4 sheet in the preview column.
 *
 * This mirrors that structure, the editor's own padding and its exact column
 * widths, so nothing moves when the record lands.
 */
export function RecordEditorSkeleton() {
  return (
    <main className="flex min-h-0 flex-col px-4 py-3 md:px-5 md:py-4 lg:h-full lg:overflow-hidden">
      {/* Back link, ATTENDANCE eyebrow and title over the three actions. */}
      <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-2 h-2.5 w-20" />
          <Skeleton className="mt-2 h-8 w-64" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-20" />
        </div>
      </div>

      {/* The editor's own grid — 26rem / 30rem preview, gap-4, not gap-6. */}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)]">
        {/* FORM COLUMN: three cards at their natural height, the column scrolls. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-auto">
          {/* 1 — Record details: borderless sheet, identity, period, signature. */}
          <section className="form-fill @container shrink-0 rounded-xl bg-card p-5 sm:p-6 lg:p-8">
            <Skeleton className="h-3.5 w-28" />

            <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 @xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="min-w-0 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ))}
            </div>

            <div className="mt-6 border-t pt-5">
              <div className="grid grid-cols-2 gap-3 @min-[44rem]:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-10 w-full rounded-md" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-32 rounded-md" />
              </div>
              {/* The dashed "No signature yet" box. */}
              <Skeleton className="mt-2 h-14 w-full rounded-md" />
            </div>
          </section>

          {/* 2 — Daily entries: heading + Clear, then a five-column input grid. */}
          <section className="form-fill shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
            <div className="grid grid-cols-[5rem_1fr_1fr_1fr_1fr] gap-1.5 py-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-3 w-3/4" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[5rem_1fr_1fr_1fr_1fr] gap-1.5 border-t py-0.5"
              >
                <Skeleton className="h-8 w-3/4" />
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-8 w-full rounded-md" />
                ))}
              </div>
            ))}
          </section>

          {/* 3 — Other attachments: label + count, then the full-width Add row. */}
          <section className="form-fill shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="mt-2 h-9 w-full rounded-md" />
          </section>
        </div>

        {/* PREVIEW COLUMN: attachment, Live preview row, then the paper. */}
        <div className="flex min-h-0 flex-col gap-3 lg:overflow-hidden">
          <section className="relative shrink-0 rounded-xl border bg-card p-3 shadow-sm">
            <Skeleton className="h-3 w-24" />
            <div className="mt-2 space-y-2">
              <Skeleton className="h-4 w-40" />
              <div className="flex items-start gap-3">
                <Skeleton className="h-24 w-32 rounded" />
                <div className="flex gap-1.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="size-7 rounded-md" />
                  ))}
                </div>
              </div>
            </div>
            {/* The APPROVED seal lifted into the card's top-right corner. */}
            <Skeleton className="absolute top-3 right-3 size-12 rounded-full" />
          </section>

          <div className="flex shrink-0 items-center justify-between gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="size-7 rounded-md" />
          </div>

          <div className="min-h-0 overflow-hidden rounded-sm lg:flex-1 lg:overflow-auto">
            <div className="mx-auto w-full bg-paper px-6 pt-6 pb-6 shadow-sm ring-1 ring-border">
              {/* Letterhead logo and the sheet's grey title bar. */}
              <Skeleton className="mb-3 h-8 w-24" />
              <Skeleton className="mb-3 h-7 w-full" />

              {/* EMP NO. / NAME / DESIGNATION / AREA boxes. */}
              <div className="border border-ink/40">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`grid grid-cols-4 ${i > 0 ? "border-t border-ink/40" : ""}`}
                  >
                    {Array.from({ length: 4 }).map((_, j) => (
                      <div key={j} className="border-r border-ink/40 p-2 last:border-r-0">
                        <Skeleton className="h-2.5 w-3/4" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* MONTH / YEAR row. */}
              <div className="mt-2 grid grid-cols-4 border border-ink/40">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border-r border-ink/40 p-2 last:border-r-0">
                    <Skeleton className="h-2.5 w-2/3" />
                  </div>
                ))}
              </div>

              {/* The five-column daily log. */}
              <div className="mt-2 border border-ink/40">
                <div className="grid grid-cols-5 bg-muted">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="border-r border-ink/40 p-2 last:border-r-0">
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-5 border-t border-ink/40">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="border-r border-ink/40 p-2 last:border-r-0">
                        <Skeleton className="h-2.5 w-full" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Employee signature rule + certified-by rule. */}
              <div className="mt-8 space-y-2">
                <Skeleton className="mx-auto h-10 w-2/3" />
                <Skeleton className="mx-auto h-1.5 w-2/3" />
                <Skeleton className="mx-auto h-2.5 w-1/2" />
              </div>
              <div className="mt-6 space-y-2">
                <Skeleton className="mx-auto h-2.5 w-1/2" />
                <Skeleton className="mx-auto h-1.5 w-2/3" />
                <Skeleton className="mx-auto h-2.5 w-2/5" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

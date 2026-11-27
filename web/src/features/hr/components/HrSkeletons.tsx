/* Shared by the HR queue and OB detail pages and the router's pending fallback. */
import { Skeleton } from "@/components/ui/skeleton";

/** Table-shaped placeholder rows, one per column of the real list. */
export function QueueSkeleton() {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border bg-card" aria-label="Loading queue">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
          <Skeleton className="h-5 w-28 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="hidden min-w-0 flex-1 space-y-2 sm:block">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="hidden h-8 w-32 shrink-0 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <main className="flex min-h-full w-full flex-col px-4 py-6 md:px-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-4 w-24" />
      </div>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[2.15rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.75rem]">
            Official Business Form
          </h1>
          <Skeleton className="mt-3 h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28 rounded-md" />
      </header>

      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="min-w-0 space-y-4">
          <section className="hr-card px-6 py-6 md:px-8" aria-hidden="true">
            <Skeleton className="h-6 w-full max-w-md" />
            <Skeleton className="mt-6 h-4 w-28" />

            <div className="mt-5 flex items-start gap-4">
              <Skeleton className="size-20 shrink-0 rounded-full" />
              <div className="grid min-w-0 flex-1 gap-5 sm:grid-cols-2">
                {[0, 1, 2, 3].map((field) => (
                  <div key={field} className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-4 w-32 max-w-full" />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {[0, 1, 2, 3].map((field) => (
                <div key={field} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-40 max-w-full" />
                </div>
              ))}
            </div>
          </section>

          <section className="hr-card px-6 py-6 md:px-8" aria-hidden="true">
            <Skeleton className="h-4 w-24" />
            <div className="mt-5 space-y-5">
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-2">
                  <Skeleton className="h-3.5 w-48 max-w-full" />
                  <Skeleton className="h-3 w-full max-w-md" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-4" aria-hidden="true">
          <section className="hr-card p-5">
            <Skeleton className="h-4 w-28" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2].map((step) => (
                <div key={step} className="flex items-center gap-3">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          </section>

          <section className="hr-card p-5">
            <Skeleton className="h-4 w-32" />
            <div className="mt-4 space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <div key={row} className="flex items-center justify-between gap-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
          </section>

          <div className="aspect-[210/297] w-full overflow-hidden rounded-sm border bg-paper p-4 shadow-sm">
            <div className="mx-auto h-4 w-2/3 rounded-sm bg-black/10" />
            <div className="mx-auto mt-2 h-2.5 w-1/2 rounded-sm bg-black/10" />
            <div className="mt-5 grid grid-cols-3 border border-black/15">
              {[0, 1, 2, 3, 4, 5].map((cell) => (
                <div key={cell} className="space-y-1.5 border border-black/10 p-2">
                  <div className="h-2 w-12 rounded-sm bg-black/10" />
                  <div className="h-2.5 w-16 max-w-full rounded-sm bg-black/10" />
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {[0, 1, 2, 3, 4, 5, 6].map((line) => (
                <div
                  key={line}
                  className="h-2 rounded-sm bg-black/10"
                  style={{ width: line % 3 === 2 ? "70%" : "100%" }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

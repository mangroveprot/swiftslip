/**
 * What the router shows while a route is still on its way.
 *
 * Routes are code-split, so a click has to fetch that app's chunk before it can
 * mount anything. On a slow link that took seconds, and the router had no
 * fallback, so the previous screen sat there while the URL changed and the
 * click looked ignored. This is the missing "the app is opening" state; the
 * app's own skeleton takes over the moment its chunk lands.
 *
 * Deliberately generic, it cannot know the destination's exact columns before
 * the destination exists; every app here is a header over one card/table, which
 * is the shape it shows. Bars match the board skeletons (`bg-muted`, one pulse),
 * plus one polite line for screen readers.
 */
const ROWS = 5;

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-muted ${className}`} />;
}

export function RoutePending() {
  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-5xl px-4 py-10 md:px-8">
      <span className="sr-only">Opening the app…</span>

      <div aria-hidden="true" className="animate-pulse">
        <Bar className="h-6 w-60 max-w-full" />
        <Bar className="mt-3 h-3 w-40 max-w-full" />

        <div className="mt-6 overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <Bar className="h-3 w-28" />
            <span className="flex gap-2">
              <Bar className="h-8 w-20 rounded-md" />
              <Bar className="h-8 w-16 rounded-md" />
            </span>
          </div>

          <div className="divide-y divide-border/60">
            {Array.from({ length: ROWS }, (_, row) => (
              <div
                key={row}
                className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-4 px-4 py-4"
              >
                <Bar className="h-3 w-3/4" />
                <Bar className="h-3 w-2/3" />
                <Bar className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

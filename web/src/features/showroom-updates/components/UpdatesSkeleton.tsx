/**
 * The board's loading state: the same table shape (checkbox + eight columns,
 * 58 px rows) with muted bars, so the page does not jump when the rows arrive.
 * Decorative only.
 */
const ROWS = 8;

const WIDTHS = ["w-4", "w-6", "w-28", "w-12", "w-20", "w-24", "w-24", "w-16", "w-24"];

export function UpdatesSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1260px] border-collapse">
          <thead>
            <tr className="divide-x divide-border/50 border-b border-border/60">
              {WIDTHS.map((width, index) => (
                <th key={index} className="px-3 py-3 text-left">
                  <span className={`block h-2.5 rounded bg-muted ${width}`} />
                </th>
              ))}
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ROWS }, (_, row) => (
              <tr key={row} className="border-b border-border/60 last:border-b-0">
                {WIDTHS.map((width, column) => (
                  <td key={column} className="px-3 py-3.5">
                    <span
                      className={`block h-3 rounded bg-muted ${width} ${
                        column === 2 ? "h-3.5" : ""
                      }`}
                    />
                    {column === 2 ? (
                      <span className="mt-1.5 block h-2.5 w-40 rounded bg-muted/80" />
                    ) : null}
                  </td>
                ))}
                <td className="px-2 py-3.5" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="divide-y md:hidden">
        {Array.from({ length: ROWS }, (_, row) => (
          <div key={row} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <span className="block h-3.5 w-2/5 rounded bg-muted" />
                <span className="block h-2.5 w-3/4 rounded bg-muted" />
              </div>
              <span className="h-5 w-16 rounded-md bg-muted" />
            </div>
            <div className="flex gap-3">
              <span className="h-2.5 w-20 rounded bg-muted" />
              <span className="h-2.5 w-16 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

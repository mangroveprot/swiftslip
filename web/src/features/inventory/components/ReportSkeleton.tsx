/**
 * Loading placeholder for the branch report preview.
 *
 * It draws the same card the document will use — header line, the phone
 * stacked list, the 13-column printed sheet with its totals block and the
 * Excel tab strip — with the dynamic values swapped for bars. Static paper
 * labels ("Deployed Assets Inventory", the column headings, "TOTAL OF:")
 * stay real, because they are the document's structure, not data.
 */
const SHEET_HEAD = [
  "ITEM ID",
  "Monitor - Last 10 Digits",
  "Keyboard & Mouse",
  "Asset Type",
  "Cubicle",
  "Assigned To",
  "Department",
  "Location",
  "Status",
  "Condition",
  "Floor",
  "Installed",
  "Notes",
];

/** Per-column bar width, in the sheet's own 13-column order. */
const CELL_WIDTHS = [
  "w-20",
  "w-16",
  "w-20",
  "w-14",
  "w-8",
  "w-20",
  "w-16",
  "w-14",
  "w-12",
  "w-12",
  "w-8",
  "w-14",
  "w-16",
];

const DESKTOP_ROWS = 8;
const PHONE_ROWS = 5;

function Bar({ className = "" }: { className?: string }) {
  return <span className={`asset-skeleton ${className}`} aria-hidden="true" />;
}

/** Paper is white/slate in both themes, so its bars are too. */
function PaperBar({ className }: { className: string }) {
  return (
    <span className="flex h-4 items-center">
      <Bar className={`h-3 bg-slate-200 ${className}`} />
    </span>
  );
}

export function ReportSkeleton() {
  return (
    <div
      className="bg-card text-card-foreground border border-border rounded-lg overflow-hidden shadow-sm"
      role="status"
      aria-busy="true"
    >
      <span className="sr-only">Loading the branch report</span>

      <div
        className="px-4 py-3 border-b border-border flex items-center justify-between gap-3"
        aria-hidden="true"
      >
        <Bar className="h-3.5 w-40" />
        <Bar className="h-3 w-20" />
      </div>

      {/* Phone: the same floor blocks the loaded report stacks below `md`. */}
      <div className="md:hidden" aria-hidden="true">
        <div className="report-mobile__subtitle">Deployed Assets Inventory</div>
        <div className="report-mobile__floor">
          <Bar className="h-3 w-24" />
          <Bar className="h-3 w-20" />
        </div>

        {Array.from({ length: PHONE_ROWS }, (_, index) => (
          <div key={index} className="report-card">
            <div className="report-card__body">
              <span className="flex h-5 items-center">
                <Bar className="h-4 w-28" />
              </span>
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-2/3" />
              </span>
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-1/2" />
              </span>
            </div>
            <div className="report-card__facts">
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-11" />
              </span>
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-9" />
              </span>
            </div>
          </div>
        ))}

        <div className="px-4 py-4 border-t border-slate-100 space-y-1 bg-white">
          <p className="text-xs font-semibold text-slate-700">TOTAL OF:</p>
          <Bar className="h-3 w-32 bg-slate-200" />
          <Bar className="mt-1 h-3 w-24 bg-slate-200" />
          <p className="text-xs text-slate-400 pt-3">PREPARED BY: RGC-Dipolog IT Personnel</p>
          <p className="text-xs font-medium text-slate-600">IT SUPPORT</p>
        </div>
      </div>

      {/* Desktop: the printed sheet, its totals and the Excel tabs. */}
      <div className="hidden md:block" aria-hidden="true">
        <div className="overflow-x-auto bg-white text-slate-700">
          <table className="report-sheet w-full text-xs border-collapse">
            <thead>
              <tr>
                <th colSpan={13} className="report-sheet__title" />
              </tr>
              <tr>
                <th colSpan={13} className="report-sheet__subtitle">
                  Deployed Assets Inventory
                </th>
              </tr>
              <tr>
                <th colSpan={13} className="report-sheet__floor">
                  <Bar className="mx-auto h-3 w-44 bg-amber-200" />
                </th>
              </tr>
              <tr className="report-sheet__head">
                {SHEET_HEAD.map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: DESKTOP_ROWS }, (_, index) => (
                <tr key={index}>
                  {CELL_WIDTHS.map((width, cell) => (
                    <td key={cell}>
                      <PaperBar className={width} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-4 border-t border-slate-100 space-y-1 bg-white">
          <p className="text-xs font-semibold text-slate-700">TOTAL OF:</p>
          <Bar className="h-3 w-40 bg-slate-200" />
          <Bar className="mt-1 h-3 w-28 bg-slate-200" />
          <p className="text-xs text-slate-400 pt-3">PREPARED BY: RGC-Dipolog IT Personnel</p>
          <p className="text-xs font-medium text-slate-600">IT SUPPORT</p>
        </div>

        <div className="flex items-end gap-0 px-2 pt-2 bg-secondary border-t border-border">
          {[0, 1, 2].map((index) => (
            <div key={index} className="report-tab">
              <Bar className="h-3 w-16 bg-slate-300" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

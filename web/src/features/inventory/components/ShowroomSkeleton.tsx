/**
 * Loading placeholders for the Showrooms screen: the three header numbers that
 * sit in the navy banner, and the board (status tabs, search + download
 * toolbar, phone cards, desktop table, footer).
 *
 * Both reuse the real classes, so the banner and the card keep their exact
 * height and the page does not jump when the rows arrive. Bars in the banner
 * are white-on-navy, not the neutral card tint.
 */
import { Download, Search } from "lucide-react";

const TABS: Array<{ label: string; width: string }> = [
  { label: "All", width: "w-6" },
  { label: "Needs action", width: "w-20" },
  { label: "In progress", width: "w-16" },
  { label: "Online", width: "w-10" },
];
const STATS = ["CCTV installed", "Units available", "Not available"];

function Bar({ className = "" }: { className?: string }) {
  return <span className={`asset-skeleton ${className}`} aria-hidden="true" />;
}

/** A table cell value: 20px line box, so with `py-2.5` the row stays 40px. */
function CellBar({ className }: { className: string }) {
  return (
    <span className="flex h-5 items-center">
      <Bar className={className} />
    </span>
  );
}

export function ShowroomStatsSkeleton() {
  return (
    <div className="showroom-stats" role="status" aria-label="Loading showroom totals">
      <div className="showroom-stats__row" aria-hidden="true">
        {STATS.map((label) => (
          <div key={label} className="showroom-stats__stat">
            <Bar className="h-6 w-8 bg-white/25" />
            <Bar className="mt-1.5 h-2.5 w-20 bg-white/20" />
          </div>
        ))}
      </div>
      <Bar className="mt-1 h-2.5 w-40 bg-white/20" />
    </div>
  );
}

export function ShowroomBoardSkeleton({ rows = 9, cards = 5 }: { rows?: number; cards?: number }) {
  return (
    <div className="showroom-board" role="status" aria-busy="true">
      <span className="sr-only">Loading showrooms</span>

      <div className="showroom-tabs pointer-events-none" aria-hidden="true">
        {TABS.map((tab) => (
          <div key={tab.label} className="showroom-tab">
            <span className="showroom-tab__label">
              <Bar className={`h-3.5 ${tab.width}`} />
            </span>
            <span className="showroom-tab__count">
              <Bar className="h-3.5 w-4" />
            </span>
          </div>
        ))}
      </div>

      <div className="showroom-toolbar pointer-events-none" aria-hidden="true">
        <div className="showroom-search relative flex h-[2.625rem] items-center">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60"
            aria-hidden="true"
          />
          <Bar className="h-3.5 w-40" />
        </div>
        <div className="showroom-download">
          <Download className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          <Bar className="h-3.5 w-24" />
        </div>
      </div>

      <div className="showroom-cards md:hidden" aria-hidden="true">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="showroom-card pointer-events-none">
            <div className="showroom-card__head">
              <Bar className="h-4 w-28" />
              <Bar className="size-4" />
            </div>
            {[0, 1].map((row) => (
              <div key={row} className="showroom-card__row">
                <span className="showroom-card__label">
                  <span className="flex h-[1.35rem] items-center">
                    <Bar className="h-2.5 w-8" />
                  </span>
                </span>
                <span className="showroom-card__values">
                  <Bar className="h-2.5 w-20" />
                  <Bar className="h-2.5 w-14" />
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="showroom-table__scroll hidden md:block" aria-hidden="true">
        <table className="showroom-table w-full text-sm table-fixed">
          <thead>
            <tr className="showroom-table__head">
              <th className="showroom-table__th">Showroom</th>
              <th className="showroom-table__th">CCTV</th>
              <th className="showroom-table__th">Internet</th>
              <th className="showroom-table__th showroom-table__th--actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => (
              <tr key={index} className="showroom-table__row">
                <td className="showroom-table__td">
                  <CellBar className="h-3.5 w-32" />
                </td>
                <td className="showroom-table__td">
                  <CellBar className="h-3.5 w-28" />
                </td>
                <td className="showroom-table__td">
                  <CellBar className="h-3.5 w-20" />
                </td>
                <td className="showroom-table__td showroom-table__actions">
                  <CellBar className="h-3.5 w-12" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="showroom-table__footer hidden md:flex" aria-hidden="true">
        <Bar className="h-3 w-40" />
      </div>
    </div>
  );
}

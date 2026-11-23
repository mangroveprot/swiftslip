/**
 * Loading placeholder for the asset table.
 *
 * It renders the table's own classes (`asset-table`, `stat-tabs`, `asset-card`,
 * …) with the text swapped for bars, so the card, the tab strip, the toolbar,
 * the column widths and the footer keep their exact dimensions and the page
 * does not jump when the rows arrive. Bar heights are set on the same line
 * boxes the real text occupies, which keeps the row height at ~45px.
 */
const TABS = ["All", "In use", "Available", "Unassigned"];

/** Width variation per row so the placeholder reads as text, not a brick wall. */
const ID_WIDTHS = ["w-24", "w-32", "w-28"];
const ASSIGNED_WIDTHS = ["w-32", "w-24", "w-28"];

function Bar({ className = "" }: { className?: string }) {
  return <span className={`asset-skeleton ${className}`} aria-hidden="true" />;
}

/** A header label: 12px text inside a 16px line box. */
function HeadBar({ className }: { className: string }) {
  return (
    <span className="flex h-4 items-center">
      <Bar className={className} />
    </span>
  );
}

/** A cell value: 20px line box, so with `py-2.5` the row stays 45px tall. */
function CellBar({ className }: { className: string }) {
  return (
    <span className="flex h-6 items-center">
      <Bar className={className} />
    </span>
  );
}

type AssetTableSkeletonProps = {
  /** Table rows. Nine fill a 1080p viewport before the footer. */
  rows?: number;
  /** Phone cards. */
  cards?: number;
};

export function AssetTableSkeleton({ rows = 9, cards = 6 }: AssetTableSkeletonProps) {
  return (
    <div className="asset-table" role="status" aria-busy="true">
      <span className="sr-only">Loading the asset inventory</span>

      {/* Status tabs: the same four segments, label over count on phones. */}
      <div className="stat-tabs pointer-events-none" aria-hidden="true">
        {TABS.map((tab) => (
          <div key={tab} className="stat-tab">
            <span className="stat-tab__label leading-5">
              <Bar className="h-3.5 w-10" />
            </span>
            <span className="stat-tab__count leading-5">
              <Bar className="h-3.5 w-4" />
            </span>
          </div>
        ))}
      </div>

      {/* Search + type filter, same field shapes as the loaded toolbar. */}
      <div className="asset-table__toolbar pointer-events-none" aria-hidden="true">
        <div className="asset-table__search relative flex h-[2.625rem] items-center">
          <svg
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M8.5 14.5a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm5.7-1.1 3.4 3.4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <Bar className="h-3.5 w-44 max-w-full" />
        </div>

        <div className="inventory-type">
          <span className="inventory-type__label">
            <span className="flex h-4 items-center">
              <Bar className="h-3 w-8" />
            </span>
          </span>
          <span className="flex h-[1.9rem] items-center">
            <Bar className="h-3.5 w-24" />
          </span>
        </div>
      </div>

      {/* Phones: select-all strip, then one card per asset. */}
      <div className="asset-table__mobile-bar md:hidden" aria-hidden="true">
        <span className="asset-table__select-all pointer-events-none">
          <Bar className="size-4 rounded-sm" />
          <Bar className="h-3 w-16" />
        </span>
      </div>

      <div className="asset-cards md:hidden" aria-hidden="true">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="asset-card pointer-events-none">
            <span className="asset-card__check">
              <Bar className="size-4 rounded-sm" />
            </span>

            <span className="asset-card__body">
              <span className="flex h-5 items-center">
                <Bar className={`h-4 max-w-full ${ID_WIDTHS[index % ID_WIDTHS.length]}`} />
              </span>
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-2/3" />
              </span>
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-1/2" />
              </span>
            </span>

            <span className="asset-card__facts">
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-11" />
              </span>
              <span className="flex h-[1.15rem] items-center">
                <Bar className="h-2.5 w-9" />
              </span>
            </span>

            <span className="asset-card__actions">
              <Bar className="size-4" />
            </span>
          </div>
        ))}
      </div>

      {/* Desktop table: the real column widths, hidden at exactly the same
          breakpoints (`md:table-cell` / `xl:table-cell`). */}
      <div className="asset-table__scroll hidden md:block" aria-hidden="true">
        <table className="w-full text-sm table-fixed min-w-[26rem] lg:min-w-0">
          <thead>
            <tr className="asset-table__head">
              <th className="asset-table__th w-9">
                <HeadBar className="h-3.5 w-3.5" />
              </th>
              <th className="asset-table__th w-[30%] md:w-[28%] xl:w-[18%]">
                <HeadBar className="h-2.5 w-12" />
              </th>
              <th className="asset-table__th w-[12%] hidden md:table-cell md:w-[13%] xl:w-[9%]">
                <HeadBar className="h-2.5 w-8" />
              </th>
              <th className="asset-table__th w-[28%] md:w-[27%] xl:w-[14%]">
                <HeadBar className="h-2.5 w-20" />
              </th>
              <th className="asset-table__th w-[17%] hidden xl:table-cell">
                <HeadBar className="h-2.5 w-16" />
              </th>
              <th className="asset-table__th w-[7%] hidden xl:table-cell">
                <HeadBar className="h-2.5 w-10" />
              </th>
              <th className="asset-table__th w-[15%] md:w-[14%] xl:w-[9%]">
                <HeadBar className="h-2.5 w-12" />
              </th>
              <th className="asset-table__th w-[10%] hidden xl:table-cell">
                <HeadBar className="h-2.5 w-14" />
              </th>
              <th className="asset-table__th asset-table__th--actions w-[5.5rem] xl:w-[7%]">
                <HeadBar className="h-2.5 w-12" />
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, index) => (
              <tr key={index} className="asset-table__row">
                <td className="asset-table__td">
                  <CellBar className="size-4 rounded-sm" />
                </td>
                <td className="asset-table__td">
                  <CellBar className={`h-3.5 ${ID_WIDTHS[index % ID_WIDTHS.length]}`} />
                </td>
                <td className="asset-table__td hidden md:table-cell">
                  <CellBar className="h-3 w-16" />
                </td>
                <td className="asset-table__td">
                  <CellBar className={`h-3.5 ${ASSIGNED_WIDTHS[index % ASSIGNED_WIDTHS.length]}`} />
                </td>
                <td className="asset-table__td hidden xl:table-cell">
                  <CellBar className="h-3 w-24" />
                </td>
                <td className="asset-table__td hidden xl:table-cell">
                  <CellBar className="h-3 w-10" />
                </td>
                <td className="asset-table__td">
                  <CellBar className="h-3.5 w-16" />
                </td>
                <td className="asset-table__td hidden xl:table-cell">
                  <CellBar className="h-3 w-14" />
                </td>
                <td className="asset-table__td asset-table__actions">
                  <CellBar className="size-5" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="asset-table__footer hidden md:flex" aria-hidden="true">
        <Bar className="h-3 w-44" />
      </div>
    </div>
  );
}

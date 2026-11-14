/**
 * Showrooms board body: the status tabs, the search + download toolbar, the
 * phone card list and the desktop table. The page owns fetching, filtering and
 * searching, so this only renders what it is given and reports edits back.
 *
 * Column labels, dot tones and tab grouping all come from
 * `@swiftslip/shared/showrooms` so the board, the header stats, the drawer and
 * the export can never disagree about what "Needs request" looks like.
 */
import type { CSSProperties } from "react";
import { Download, PencilLine, Search } from "lucide-react";

import type { Showroom, ShowroomFilter } from "@swiftslip/shared/showrooms";
import {
  cctvConnectionLabel,
  cctvConnectionTone,
  cctvInstalledLabel,
  cctvInstalledTone,
  internetLabel,
  internetTone,
} from "@swiftslip/shared/showrooms";

import { ShowroomCard } from "./ShowroomCard";

type ShowroomTableProps = {
  showrooms: Showroom[];
  totalCount: number;
  counts: { all: number; needsAction: number; inProgress: number; online: number };
  filter: ShowroomFilter;
  onFilterChange: (filter: ShowroomFilter) => void;
  searchText: string;
  onSearchChange: (value: string) => void;
  onDownload: () => void;
  downloading: boolean;
  canDownload: boolean;
  onEdit: (showroom: Showroom) => void;
};

const EMPTY_FILTER = "No showrooms match this filter.";
const EMPTY_ALL = "No showrooms yet.";

export function ShowroomTable({
  showrooms,
  totalCount,
  counts,
  filter,
  onFilterChange,
  searchText,
  onSearchChange,
  onDownload,
  downloading,
  canDownload,
  onEdit,
}: ShowroomTableProps) {
  const tabs: Array<{ key: ShowroomFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "needs_action", label: "Needs action", count: counts.needsAction },
    { key: "in_progress", label: "In progress", count: counts.inProgress },
    { key: "online", label: "Online", count: counts.online },
  ];

  const emptyMessage = totalCount === 0 ? EMPTY_ALL : EMPTY_FILTER;

  return (
    <div className="showroom-board">
      <div className="showroom-tabs" role="group" aria-label="Filter showrooms by status">
        {tabs.map((tab) => {
          const active = tab.key === filter;
          return (
            <button
              type="button"
              key={tab.key}
              className={active ? "showroom-tab showroom-tab--active" : "showroom-tab"}
              aria-pressed={active}
              onClick={() => onFilterChange(tab.key)}
            >
              <span className="showroom-tab__label">{tab.label}</span>
              <span className="showroom-tab__count">{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div className="showroom-toolbar">
        <div className="relative w-full md:w-72 lg:w-80">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="text"
            id="showroom-search"
            name="showroom-search"
            aria-label="Search showrooms"
            value={searchText}
            placeholder="Search by showroom"
            className="showroom-search"
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="showroom-download"
          disabled={downloading || !canDownload}
          aria-busy={downloading}
          onClick={onDownload}
        >
          <Download className="size-4 shrink-0" aria-hidden="true" />
          <span>{downloading ? "Preparing…" : "Download Excel"}</span>
        </button>
      </div>

      <div className="showroom-cards md:hidden">
        {showrooms.length === 0 ? (
          <p className="showroom-card__empty">{emptyMessage}</p>
        ) : (
          showrooms.map((showroom, index) => (
            <ShowroomCard
              key={showroom.showroom_id}
              showroom={showroom}
              index={index}
              onEdit={onEdit}
            />
          ))
        )}
      </div>

      <div className="showroom-table__scroll hidden md:block">
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
            {showrooms.length === 0 ? (
              <tr>
                <td colSpan={4} className="showroom-table__td">
                  <p>{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              showrooms.map((showroom, index) => {
                const note = showroom.cctv_note?.trim() ?? "";
                // The instalment state only shows when it isn't simply "yes":
                // a showroom without working CCTV should never read "Offline".
                const settled = showroom.cctv_installed !== "active";
                const cctvLabel = settled
                  ? cctvInstalledLabel(showroom.cctv_installed)
                  : cctvConnectionLabel(showroom.cctv_connection);
                const cctvTone = settled
                  ? cctvInstalledTone(showroom.cctv_installed)
                  : cctvConnectionTone(showroom.cctv_connection);
                const netTone = internetTone(showroom.internet);
                return (
                  <tr
                    key={showroom.showroom_id}
                    className="showroom-table__row asset-row-fade-in-right"
                    style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
                  >
                    <td className="showroom-table__td">
                      <span className="showroom-table__name" title={showroom.showroom_name}>
                        {showroom.showroom_name}
                      </span>
                    </td>

                    <td className="showroom-table__td">
                      <span className="showroom-table__values">
                        <span className="showroom-table__value">
                          {cctvTone !== "none" && (
                            <span className={`showroom-dot showroom-dot--${cctvTone}`} />
                          )}
                          {cctvLabel}
                        </span>
                        {note !== "" && <span className="showroom-table__note">{note}</span>}
                      </span>
                    </td>

                    <td className="showroom-table__td">
                      <span className="showroom-table__values">
                        <span className="showroom-table__value">
                          {netTone !== "none" && (
                            <span className={`showroom-dot showroom-dot--${netTone}`} />
                          )}
                          {internetLabel(showroom.internet)}
                        </span>
                      </span>
                    </td>

                    <td
                      className="showroom-table__td showroom-table__actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="row-action"
                        aria-label={`Edit ${showroom.showroom_name}`}
                        title={`Edit ${showroom.showroom_name}`}
                        onClick={() => onEdit(showroom)}
                      >
                        <PencilLine className="size-4" aria-hidden="true" />
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="showroom-table__footer hidden md:flex">
        <span>
          Showing {showrooms.length} of {totalCount} showroom{totalCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}

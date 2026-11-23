/**
 * Showrooms board body: the status tabs, the search + download toolbar, the
 * phone card list and the desktop table. The page owns fetching, filtering and
 * searching, so this only renders what it is given and reports edits back.
 *
 * The Showroom cell prints the location the linked "Summary of SR Status and
 * Updates" row carries, under the inventory name, exactly like the supplied
 * column mock. Status and Action required are that row's own values; a linked
 * row with a blank cell reads "Not recorded", and an unlinked showroom reads
 * "Not recorded" in Status with an inline "Link showroom" action.
 *
 * Column labels, dot tones and tab grouping all come from
 * `@swiftslip/shared/showrooms` so the board, the drawer and the export can
 * never disagree about what "Not recorded" looks like.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import {
  Download,
  ExternalLink,
  Link2,
  MoreHorizontal,
  PencilLine,
  Search,
  Trash2,
} from "lucide-react";

import type { Showroom, ShowroomFilter } from "@swiftslip/shared/showrooms";
import {
  cctvConnectionLabel,
  cctvConnectionTone,
  cctvInstalledLabel,
  cctvInstalledTone,
  internetLabel,
  internetTone,
  showroomInitials,
  showroomLinkActionLabel,
  showroomLinkStatusLabel,
  showroomUpdateStatusTone,
} from "@swiftslip/shared/showrooms";
import { isHttpUrl } from "@swiftslip/shared/showroom-updates";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ShowroomCard } from "./ShowroomCard";
import { ShowroomPhotoDialog } from "./ShowroomPhotoDialog";

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
  onDelete: (showroom: Showroom) => void;
};

const EMPTY_FILTER = "No showrooms match this filter.";
const EMPTY_ALL = "No showrooms yet.";

function RowMenu({
  showroom,
  onEdit,
  onDelete,
}: {
  showroom: Showroom;
  onEdit: (showroom: Showroom) => void;
  onDelete: (showroom: Showroom) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="row-menu__trigger"
          aria-label={`Actions for ${showroom.showroom_name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onEdit(showroom)}>
          {showroom.link ? (
            <>
              <PencilLine className="size-4" aria-hidden="true" />
              Edit details
            </>
          ) : (
            <>
              <Link2 className="size-4" aria-hidden="true" />
              Link showroom
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(showroom)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete showroom
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  onDelete,
}: ShowroomTableProps) {
  // The board thumbnail opens this; the drawer's preview is separate so the
  // row is never the ancestor of a portal.
  const [preview, setPreview] = useState<Showroom | null>(null);

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
              onPreview={setPreview}
            />
          ))
        )}
      </div>

      <div className="showroom-table__scroll hidden md:block">
        <table className="showroom-table w-full text-sm table-fixed">
          <thead>
            <tr className="showroom-table__head">
              <th className="showroom-table__th">Showroom</th>
              <th className="showroom-table__th">Status</th>
              <th className="showroom-table__th">Action required</th>
              <th className="showroom-table__th">CCTV</th>
              <th className="showroom-table__th">Internet</th>
              <th className="showroom-table__th showroom-table__th--actions">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showrooms.length === 0 ? (
              <tr>
                <td colSpan={6} className="showroom-table__td">
                  <p>{emptyMessage}</p>
                </td>
              </tr>
            ) : (
              showrooms.map((showroom, index) => {
                const note = showroom.cctv_note?.trim() ?? "";
                const location = showroom.link?.location?.trim() ?? "";
                const mapUrl =
                  showroom.link?.map_url && isHttpUrl(showroom.link.map_url)
                    ? showroom.link.map_url
                    : "";
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
                const statusTone = showroomUpdateStatusTone(showroom.link?.status ?? null);
                const statusLabel = showroomLinkStatusLabel(showroom.link);
                const actionLabel = showroomLinkActionLabel(showroom.link);
                return (
                  <tr
                    key={showroom.showroom_id}
                    className="showroom-table__row asset-row-fade-in-right cursor-pointer"
                    style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
                    onClick={() => onEdit(showroom)}
                  >
                    <td className="showroom-table__td">
                      <div className="showroom-table__identity">
                        {showroom.photo_thumb ? (
                          <button
                            type="button"
                            className="showroom-table__thumb showroom-table__thumb--button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setPreview(showroom);
                            }}
                            aria-label={`Preview ${showroom.showroom_name} photo`}
                          >
                            <img
                              src={showroom.photo_thumb}
                              alt=""
                              loading="lazy"
                              className="size-full object-cover"
                            />
                          </button>
                        ) : (
                          <span
                            className="showroom-table__thumb showroom-table__thumb--empty"
                            aria-hidden="true"
                          >
                            {showroomInitials(showroom.showroom_name)}
                          </span>
                        )}
                        <span className="showroom-table__identity-text">
                          <span className="showroom-table__name" title={showroom.showroom_name}>
                            {showroom.showroom_name}
                          </span>
                          {location !== "" &&
                            (mapUrl ? (
                              <a
                                href={mapUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                title="Open in Google Maps"
                                className="group/loc flex w-fit max-w-full items-center gap-0.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                              >
                                <span className="min-w-0 truncate group-hover/loc:underline group-hover/loc:underline-offset-2">
                                  {location}
                                </span>
                                <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                              </a>
                            ) : (
                              <span className="showroom-table__location" title={location}>
                                {location}
                              </span>
                            ))}
                        </span>
                      </div>
                    </td>

                    <td className="showroom-table__td">
                      <span
                        className={
                          showroom.link ? "showroom-table__value" : "showroom-table__muted"
                        }
                      >
                        {statusTone !== "none" && (
                          <span className={`showroom-dot showroom-dot--${statusTone}`} />
                        )}
                        {statusLabel}
                      </span>
                    </td>

                    <td className="showroom-table__td">
                      {showroom.link ? (
                        <span className="showroom-table__action-text" title={actionLabel}>
                          {actionLabel}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="showroom-link-action"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(showroom);
                          }}
                        >
                          Link showroom
                        </button>
                      )}
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
                      <RowMenu showroom={showroom} onEdit={onEdit} onDelete={onDelete} />
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

      <ShowroomPhotoDialog
        isOpen={preview != null}
        title={preview?.showroom_name ?? ""}
        subtitle="Showroom photo"
        src={preview?.photo_thumb ?? null}
        showroomId={preview?.showroom_id}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

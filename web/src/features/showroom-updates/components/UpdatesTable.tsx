/**
 * The board's table, plus the phone card list. Purely presentational: the page
 * owns fetching, filtering, sorting and the drawer; this reports the row the
 * user picked and the selection changes.
 *
 * Columns are the reference's: No., Showroom (location underneath), Status,
 * Requirements, Action required, Responsible person, Open date, Vehicle and the
 * row menu. Remarks lives in the drawer and in both exports.
 */
import { useEffect, useRef } from "react";
import {
  ChevronsUpDown,
  ExternalLink,
  History,
  MoreHorizontal,
  PencilLine,
  Trash2,
} from "lucide-react";

import type { ShowroomUpdate } from "@swiftslip/shared/showroom-updates";
import { isHttpUrl, showroomUpdateBoardDate } from "@swiftslip/shared/showroom-updates";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { PersonCell, StatusPill, VehicleTag } from "./Pills";

type SortDir = "asc" | "desc";

type UpdatesTableProps = {
  rows: ShowroomUpdate[];
  /** True when the unfiltered board is empty, so the message can say why. */
  emptyBoard: boolean;
  onEdit: (row: ShowroomUpdate) => void;
  onHistory: (row: ShowroomUpdate) => void;
  onDelete: (row: ShowroomUpdate) => void;
  selected: ReadonlySet<number>;
  onToggleRow: (updateId: number) => void;
  onToggleAll: (checked: boolean) => void;
  sortDir: SortDir;
  onToggleSort: () => void;
};

const EMPTY_FILTERED = "No showrooms match this search.";
const EMPTY_BOARD = "No showrooms yet.";

const CHECKBOX_CLASS =
  "size-4 cursor-pointer rounded-[4px] border-border bg-card accent-primary align-middle";

function RowMenu({
  row,
  onEdit,
  onHistory,
  onDelete,
}: {
  row: ShowroomUpdate;
  onEdit: (row: ShowroomUpdate) => void;
  onHistory: (row: ShowroomUpdate) => void;
  onDelete: (row: ShowroomUpdate) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label={`Actions for ${row.showroom_name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onEdit(row)}>
          <PencilLine className="size-4" aria-hidden="true" />
          Edit details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onHistory(row)}>
          <History className="size-4" aria-hidden="true" />
          View history
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(row)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete showroom
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The header checkbox: checked when every row on this page is selected, and
 * "mixed" (a dash) when only some are. `indeterminate` has no HTML attribute,
 * so it is set on the DOM node.
 */
function SelectAllCheckbox({
  checked,
  mixed,
  onChange,
}: {
  checked: boolean;
  mixed: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={CHECKBOX_CLASS}
      aria-label="Select every showroom on this page"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      onClick={(event) => event.stopPropagation()}
    />
  );
}

export function UpdatesTable({
  rows,
  emptyBoard,
  onEdit,
  onHistory,
  onDelete,
  selected,
  onToggleRow,
  onToggleAll,
  sortDir,
  onToggleSort,
}: UpdatesTableProps) {
  const emptyMessage = emptyBoard ? EMPTY_BOARD : EMPTY_FILTERED;
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.update_id));
  const someSelected = rows.some((row) => selected.has(row.update_id));

  return (
    <>
      {/* Phone / narrow tablet: one card per showroom, the same facts. */}
      <div className="divide-y md:hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          rows.map((row) => {
            const mapUrl = row.map_url && isHttpUrl(row.map_url) ? row.map_url : "";
            return (
              <div key={row.update_id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  className={`${CHECKBOX_CLASS} mt-1`}
                  aria-label={`Select ${row.showroom_name}`}
                  checked={selected.has(row.update_id)}
                  onChange={() => onToggleRow(row.update_id)}
                />
                <div
                  className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1.5"
                  onClick={() => onEdit(row)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onEdit(row);
                        }}
                        className="block max-w-full truncate rounded-sm text-left text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {row.showroom_name}
                      </button>
                      {mapUrl ? (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          title="Open in Google Maps"
                          className="group/loc mt-0.5 flex w-fit max-w-full items-center gap-0.5 rounded-sm text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0 truncate group-hover/loc:underline group-hover/loc:underline-offset-2">
                            {row.location}
                          </span>
                          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="mt-0.5 block max-w-full truncate text-xs text-muted-foreground">
                          {row.location}
                        </span>
                      )}
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="text-[11px] font-semibold tracking-wide text-foreground/70">
                      No. {row.sr_no}
                    </span>
                    <PersonCell person={row.responsible_person} />
                    <span>{showroomUpdateBoardDate(row.open_date)}</span>
                    <VehicleTag vehicle={row.vehicle} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: the reference's columns, scrollable rather than squeezed. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1260px] border-collapse text-sm">
          <thead>
            <tr className="divide-x divide-border/50 border-b border-border/60 text-left text-[12px] font-medium text-muted-foreground">
              <th scope="col" className="w-10 py-2.5 pr-2 pl-4">
                <SelectAllCheckbox
                  checked={allSelected}
                  mixed={someSelected && !allSelected}
                  onChange={onToggleAll}
                />
              </th>
              <th
                scope="col"
                aria-sort={sortDir === "asc" ? "ascending" : "descending"}
                className="w-16 px-3 py-2.5"
              >
                <button
                  type="button"
                  onClick={onToggleSort}
                  className="inline-flex items-center gap-1 rounded text-left transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  title="Sort by number"
                >
                  No.
                  <ChevronsUpDown className="size-3.5 opacity-70" aria-hidden="true" />
                </button>
              </th>
              <th scope="col" className="px-3 py-2.5">
                Showroom
              </th>
              <th scope="col" className="w-28 px-3 py-2.5">
                Status
              </th>
              <th scope="col" className="w-40 px-3 py-2.5">
                Requirements
              </th>
              <th scope="col" className="w-44 px-3 py-2.5">
                Action required
              </th>
              <th scope="col" className="w-44 px-3 py-2.5">
                Responsible person
              </th>
              <th scope="col" className="w-36 px-3 py-2.5">
                Open date
              </th>
              <th scope="col" className="w-44 px-3 py-2.5">
                Vehicle
              </th>
              <th scope="col" className="w-12 px-2 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selected.has(row.update_id);
                const mapUrl = row.map_url && isHttpUrl(row.map_url) ? row.map_url : "";
                return (
                  <tr
                    key={row.update_id}
                    className={`group cursor-pointer border-b border-border/60 transition-colors last:border-b-0 focus-visible:bg-secondary/30 focus-visible:outline-none ${
                      isSelected ? "bg-secondary/40" : "hover:bg-secondary/25"
                    }`}
                    tabIndex={0}
                    onClick={() => onEdit(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEdit(row);
                      }
                    }}
                  >
                    <td className="py-3 pr-2 pl-4" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="checkbox"
                        className={CHECKBOX_CLASS}
                        aria-label={`Select ${row.showroom_name}`}
                        checked={isSelected}
                        onChange={() => onToggleRow(row.update_id)}
                      />
                    </td>
                    <td className="px-3 py-3 text-[12.5px] font-semibold tabular-nums text-muted-foreground">
                      {row.sr_no}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="block max-w-[20rem] truncate text-[13.5px] font-semibold text-foreground"
                        title={row.showroom_name}
                      >
                        {row.showroom_name}
                      </span>
                      {mapUrl ? (
                        <a
                          href={mapUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                          title="Open in Google Maps"
                          className="group/loc mt-0.5 flex w-fit max-w-[20rem] items-center gap-0.5 rounded-sm text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0 truncate group-hover/loc:underline group-hover/loc:underline-offset-2">
                            {row.location}
                          </span>
                          <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                        </a>
                      ) : (
                        <span
                          className="mt-0.5 block max-w-[20rem] truncate text-[12px] text-muted-foreground"
                          title={row.location}
                        >
                          {row.location}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="block max-w-[16rem] truncate text-[13px] text-foreground/90"
                        title={row.requirements ?? undefined}
                      >
                        {row.requirements ?? <span className="text-muted-foreground">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className="block max-w-[16rem] truncate text-[13px] text-foreground/90"
                        title={row.action_required ?? undefined}
                      >
                        {row.action_required ?? <span className="text-muted-foreground">—</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <PersonCell person={row.responsible_person} />
                    </td>
                    <td className="px-3 py-3 text-[12.5px] whitespace-nowrap text-foreground/90">
                      {row.open_date ? (
                        showroomUpdateBoardDate(row.open_date)
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <VehicleTag vehicle={row.vehicle} />
                    </td>
                    <td
                      className="px-2 py-3 text-right"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <RowMenu
                        row={row}
                        onEdit={onEdit}
                        onHistory={onHistory}
                        onDelete={onDelete}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

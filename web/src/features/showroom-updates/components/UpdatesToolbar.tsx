/**
 * The board's one control strip: search on the left, status chips with their
 * counts in the middle, Export on the right, exactly the reference's order.
 *
 * The chips are the sheet's statuses; "All" resets the filter. Counts describe
 * the WHOLE board, never the search results, so a chip can always tell you how
 * many rows are behind it. The blank row (Jimenez) has no chip of its own, like
 * the source sheet, but it is still counted in "All".
 */
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  Search,
} from "lucide-react";

import type {
  ShowroomUpdateCounts,
  ShowroomUpdateFilter,
} from "@swiftslip/shared/showroom-updates";
import { SHOWROOM_UPDATE_STATUSES } from "@swiftslip/shared/showroom-updates";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { STATUS_BOARD } from "../board-colors";

type UpdatesToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  filter: ShowroomUpdateFilter;
  onFilterChange: (filter: ShowroomUpdateFilter) => void;
  counts: ShowroomUpdateCounts;
  onExportPdf: () => void;
  onExportExcel: () => void;
  /** Prints the summary sheet through the browser dialog (Ctrl+P does too). */
  onPrint: () => void;
  /** Opens the drawer in "Add showroom" mode. */
  onAdd: () => void;
  /** True while a file is being built, so the menu can't be fired twice. */
  exporting: boolean;
};

export function UpdatesToolbar({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  counts,
  onExportPdf,
  onExportExcel,
  onPrint,
  onAdd,
  exporting,
}: UpdatesToolbarProps) {
  return (
    <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:gap-5">
      <label className="relative w-full lg:w-[260px] lg:shrink-0">
        <span className="sr-only">Search showrooms</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          placeholder="Find a showroom or place"
          className="h-9 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-1 lg:justify-start"
        role="group"
        aria-label="Filter by status"
      >
        <FilterChip
          label="All"
          count={counts.all}
          active={filter === "all"}
          onClick={() => onFilterChange("all")}
        />
        {SHOWROOM_UPDATE_STATUSES.map((status) => (
          <FilterChip
            key={status.value}
            label={status.chipLabel}
            count={counts[status.value]}
            dot={STATUS_BOARD[status.value].dot}
            active={filter === status.value}
            onClick={() => onFilterChange(status.value)}
          />
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2 self-start lg:self-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={exporting}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-foreground shadow-xs transition-colors hover:bg-secondary/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-progress disabled:opacity-60"
            >
              <Download className="size-4 text-muted-foreground" aria-hidden="true" />
              {exporting ? "Preparing…" : "Export"}
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onExportPdf}>
              <FileText className="size-4" aria-hidden="true" />
              Export as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportExcel}>
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Export as Excel
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onPrint}>
              <Printer className="size-4" aria-hidden="true" />
              Print
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#c24a0e] px-3 text-[13px] font-semibold text-white shadow-xs transition-colors hover:bg-[#a83f0b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-navy)]"
        >
          <Plus className="size-4" aria-hidden="true" />
          Add showroom
        </button>
      </div>
    </div>
  );
}

function FilterChip({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  /** The status colour, drawn as a small disc (statuses only, not "All"). */
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        active
          ? "border-transparent bg-secondary/70 text-foreground"
          : "border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground"
      }`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot }}
        />
      ) : null}
      {label}
      <span className="tabular-nums text-[11.5px] font-normal text-muted-foreground">{count}</span>
    </button>
  );
}

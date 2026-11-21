/**
 * Showroom Updates: the owner's "Summary of SR Status and Updates" sheet as a
 * live board. One page, no sidebar (there is only one board in this app), its
 * own grant (`showroom-updates`).
 *
 * The rows are fetched once and filtered/searched in the browser, like the
 * Inventory boards. Exporting uses the currently visible rows, so the PDF and
 * the workbook are exactly what the person is looking at.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type {
  ShowroomUpdate,
  ShowroomUpdateFilter,
  ShowroomUpdateSaveRequest,
} from "@swiftslip/shared/showroom-updates";
import {
  matchesShowroomUpdateFilter,
  matchesShowroomUpdateSearch,
  SHOWROOM_UPDATE_ACTION_SUGGESTIONS,
  SHOWROOM_UPDATE_REQUIREMENT_SUGGESTIONS,
  showroomUpdateCounts,
  totalActiveSr,
} from "@swiftslip/shared/showroom-updates";

import {
  createShowroomUpdate,
  deleteShowroomUpdates,
  saveShowroomUpdate,
} from "@/api/showroom-updates.functions";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { printSheet } from "@/lib/print";
import { toast } from "@/lib/toast";
import { savePdfFrom } from "@/lib/save-pdf";

import { ShowroomUpdateSheet, SHEET_ID } from "../components/ShowroomUpdateSheet";
import { UpdatesBulkBar } from "../components/UpdatesBulkBar";
import { UpdatesDrawer } from "../components/UpdatesDrawer";
import { UpdatesSkeleton } from "../components/UpdatesSkeleton";
import { UpdatesTable } from "../components/UpdatesTable";
import { UpdatesToolbar } from "../components/UpdatesToolbar";
import { UpdatesTopBar } from "../components/UpdatesTopBar";
import { downloadShowroomUpdatesWorkbook } from "../lib/export-excel";
import { buildShowroomUpdatePdfFileName } from "../lib/file-names";
import { showroomUpdatesQueryOptions } from "../queries";

/** One screen of rows; the sheet itself has only 22. */
const PAGE_SIZE = 25;

export function ShowroomUpdatesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery(showroomUpdatesQueryOptions());

  const rows = useMemo(() => data ?? [], [data]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ShowroomUpdateFilter>("all");
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<ReadonlySet<number>>(() => new Set());
  const [editing, setEditing] = useState<ShowroomUpdate | null>(null);
  const [creating, setCreating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportingRef = useRef(false);
  /** Rows ticked for deletion, snapshotted when the dialog opens. */
  const [pendingDelete, setPendingDelete] = useState<ShowroomUpdate[]>([]);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  /** Counts always describe the whole board, never the search results. */
  const counts = useMemo(() => showroomUpdateCounts(rows), [rows]);

  /**
   * The drawer's suggestion menus for the two free-text cells: every value the
   * board already uses, then the seed's own examples. A row added later joins
   * the list without a code change.
   */
  const requirementOptions = useMemo(() => {
    const used = rows
      .map((row) => row.requirements?.trim())
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set([...SHOWROOM_UPDATE_REQUIREMENT_SUGGESTIONS, ...used]));
  }, [rows]);

  const actionOptions = useMemo(() => {
    const used = rows
      .map((row) => row.action_required?.trim())
      .filter((value): value is string => Boolean(value));
    return Array.from(new Set([...SHOWROOM_UPDATE_ACTION_SUGGESTIONS, ...used]));
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesShowroomUpdateFilter(row, filter) && matchesShowroomUpdateSearch(row, search),
      ),
    [rows, filter, search],
  );

  /** The "No." column's sort, applied before paging so it covers every row. */
  const ordered = useMemo(() => {
    const direction = sortDir === "asc" ? 1 : -1;
    return [...visible].sort((a, b) => (a.sr_no - b.sr_no) * direction);
  }, [visible, sortDir]);

  // A narrower result may not have the page or the selection we were on.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [search, filter]);

  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = ordered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  /** The export's total describes the rows being exported. */
  const activeCount = useMemo(() => totalActiveSr(ordered), [ordered]);

  const toggleRow = (updateId: number) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(updateId)) next.delete(updateId);
      else next.add(updateId);
      return next;
    });
  };

  /** Select-all only touches the page in view, like the checkbox's label says. */
  const toggleAll = (checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const row of pageRows) {
        if (checked) next.add(row.update_id);
        else next.delete(row.update_id);
      }
      return next;
    });
  };

  const closeDrawer = () => {
    setEditing(null);
    setCreating(false);
  };

  const handleSave = async (updateId: number | null, data: ShowroomUpdateSaveRequest) => {
    if (updateId === null) {
      const created = await createShowroomUpdate({ data });
      // Show the new row even if a filter/search was hiding it, then refresh.
      setSearch("");
      setFilter("all");
      setSortDir("asc");
      setCreating(false);
      await qc.invalidateQueries({ queryKey: ["showroom-updates"] });
      toast.success(`${created.showroom_name} was added to the board.`);
      return;
    }

    await saveShowroomUpdate({ updateId, data });
    await qc.invalidateQueries({ queryKey: showroomUpdatesQueryOptions().queryKey });
    await qc.invalidateQueries({ queryKey: ["showroom-updates", updateId, "events"] });
    setEditing(null);
    toast.success("Your changes have been saved.");
  };

  /** Open the confirm dialog for the current selection, if any. */
  const requestDeleteSelected = () => {
    const targets = rows.filter((row) => selected.has(row.update_id));
    if (targets.length === 0) return;
    setPendingDelete(targets);
  };

  /** The row menu's delete: one row, same confirmation as a bulk delete. */
  const requestDeleteOne = (row: ShowroomUpdate) => setPendingDelete([row]);

  const cancelDelete = () => {
    if (deleting) return;
    setPendingDelete([]);
  };

  const confirmDelete = async () => {
    // The button's `disabled` only lands on the next render, so guard here too.
    if (deletingRef.current || pendingDelete.length === 0) return;
    deletingRef.current = true;
    setDeleting(true);
    const count = pendingDelete.length;
    try {
      await deleteShowroomUpdates({ data: { ids: pendingDelete.map((row) => row.update_id) } });
      await qc.invalidateQueries({ queryKey: showroomUpdatesQueryOptions().queryKey });
      setSelected(new Set());
      setPendingDelete([]);
      toast.success(count > 1 ? `${count} showrooms deleted` : "Showroom deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the selected showrooms.");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const exportPdf = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      await savePdfFrom(SHEET_ID, buildShowroomUpdatePdfFileName());
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    if (exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    try {
      // The workbook ends on the last real row — no reserved blank rows.
      await downloadShowroomUpdatesWorkbook(ordered, activeCount);
      toast.success("Excel saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not build the Excel file.");
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  return (
    <div className="min-h-dvh pb-16 text-foreground">
      <UpdatesTopBar />

      <main className="mx-auto w-full max-w-[1760px] px-4 md:px-8">
        <h1 className="mt-1 mb-4 text-[26px] font-bold tracking-tight text-foreground md:text-[30px]">
          Summary of SR Status and Updates
        </h1>

        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <UpdatesToolbar
            search={search}
            onSearchChange={setSearch}
            filter={filter}
            onFilterChange={setFilter}
            counts={counts}
            onExportPdf={() => void exportPdf()}
            onExportExcel={() => void exportExcel()}
            onPrint={() => printSheet()}
            onAdd={() => {
              setEditing(null);
              setCreating(true);
            }}
            exporting={exporting}
          />

          <UpdatesBulkBar
            selectedCount={selected.size}
            onClear={() => setSelected(new Set())}
            onDelete={requestDeleteSelected}
          />

          {isLoading ? (
            <UpdatesSkeleton />
          ) : isError ? (
            <div className="px-4 py-16 text-center">
              <p className="text-sm font-medium text-foreground">The board could not be loaded.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {error instanceof Error ? error.message : "Try again in a moment."}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary"
              >
                Try again
              </button>
            </div>
          ) : (
            <UpdatesTable
              rows={pageRows}
              emptyBoard={rows.length === 0}
              onEdit={(row) => {
                setCreating(false);
                setEditing(row);
              }}
              onHistory={setEditing}
              onDelete={requestDeleteOne}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              sortDir={sortDir}
              onToggleSort={() => setSortDir((dir) => (dir === "asc" ? "desc" : "asc"))}
            />
          )}

          {!isLoading && !isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {ordered.length} of {rows.length} showrooms
              </p>
              <div className="flex items-center gap-1">
                <PageButton
                  label="Previous page"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </PageButton>
                {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
                  <button
                    key={number}
                    type="button"
                    aria-current={number === currentPage ? "page" : undefined}
                    onClick={() => setPage(number)}
                    className={`size-8 rounded-md text-xs font-semibold tabular-nums transition-colors ${
                      number === currentPage
                        ? "border border-border bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    }`}
                  >
                    {number}
                  </button>
                ))}
                <PageButton
                  label="Next page"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight className="size-4" aria-hidden="true" />
                </PageButton>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      {/* The printable sheet, always mounted so the PDF and Print actions have
          a real, measured element to capture. Never visible on screen. Portalled
          to <body> so the print stylesheet can make it the only printed box —
          Ctrl+P prints the sheet, not the board (styles.css, `@page sru`). */}
      {createPortal(
        <div className="sru-export-stage" aria-hidden="true">
          <ShowroomUpdateSheet rows={ordered} totalActive={activeCount} />
        </div>,
        document.body,
      )}

      <UpdatesDrawer
        row={editing}
        mode={creating ? "create" : "edit"}
        onClose={closeDrawer}
        onSave={handleSave}
        requirementOptions={requirementOptions}
        actionOptions={actionOptions}
      />

      <ConfirmModal
        isOpen={pendingDelete.length > 0}
        title={
          pendingDelete.length > 1
            ? `Delete ${pendingDelete.length} showrooms?`
            : "Delete showroom?"
        }
        message={
          pendingDelete.length > 1
            ? `This will permanently remove ${pendingDelete.length} selected showrooms and their history. This can't be undone.`
            : `This will permanently remove ${
                pendingDelete[0]?.showroom_name ?? "this showroom"
              } and its history. This can't be undone.`
        }
        confirmLabel="Delete"
        busy={deleting}
        busyLabel="Deleting…"
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

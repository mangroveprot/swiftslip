/**
 * Showrooms page.
 *
 * The CCTV / internet status board that sits beside Assets: one row per
 * showroom, grouped into All / Needs action / In progress / Online tabs, with
 * the installed stock summarized in the navy header. The header numbers are
 * also filters (click "CCTV installed" or "Not available"), and searching is
 * client-side over the one list payload, like the assets page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ConfirmModal } from "@/components/common/ConfirmModal";
import { deleteShowroom, saveShowroom, saveShowroomStock } from "@/api/showrooms.functions";
import { toast } from "@/lib/toast";
import type { Showroom, ShowroomFilter, ShowroomSaveRequest } from "@swiftslip/shared/showrooms";
import {
  matchesShowroomFilter,
  showroomCctvSummary,
  showroomInProgress,
  showroomNeedsAction,
  showroomOnline,
} from "@swiftslip/shared/showrooms";

import type { ShowroomDrawerMode } from "../components/ShowroomDrawer";
import { ShowroomDrawer } from "../components/ShowroomDrawer";
import { ShowroomStats } from "../components/ShowroomStats";
import { ShowroomTable } from "../components/ShowroomTable";
import { buildShowroomFileName, downloadShowroomsWorkbook } from "../lib/showroom-export";
import { showroomsQueryOptions, showroomStockQueryOptions } from "../queries";
import { useInventoryShell } from "../shell-context";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function InventoryShowroomsPage() {
  const shell = useInventoryShell();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery(showroomsQueryOptions());
  const {
    data: stock,
    isLoading: stockLoading,
    isError: stockError,
    error: stockErrorObj,
  } = useQuery(showroomStockQueryOptions());

  const showToast = useCallback(
    (message: string, level: "success" | "error" | "warning" | "info" = "success") =>
      toast[level](message),
    [],
  );

  const showrooms = useMemo(() => data ?? [], [data]);

  const [filter, setFilter] = useState<ShowroomFilter>("all");
  const [searchText, setSearchText] = useState("");
  const [downloading, setDownloading] = useState(false);
  const downloadingRef = useRef(false);

  const [drawer, setDrawer] = useState<{
    open: boolean;
    showroom: Showroom | null;
    mode: ShowroomDrawerMode;
  }>({ open: false, showroom: null, mode: "view" });

  const [pendingDelete, setPendingDelete] = useState<Showroom | null>(null);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  /* ------------------------------------------------------ derived - */

  /** Tab numbers always describe all showrooms, so they don't move with search. */
  const counts = useMemo(
    () => ({
      all: showrooms.length,
      needsAction: showrooms.filter((row) => showroomNeedsAction(row)).length,
      inProgress: showrooms.filter((row) => showroomInProgress(row)).length,
      online: showrooms.filter((row) => showroomOnline(row)).length,
    }),
    [showrooms],
  );

  const visible = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return showrooms.filter(
      (row) =>
        matchesShowroomFilter(row, filter) &&
        (query === "" || row.showroom_name.toLowerCase().includes(query)),
    );
  }, [showrooms, filter, searchText]);

  /** Same numbers as the banner; the Excel summary block reuses them. */
  const cctvSummary = useMemo(
    () => showroomCctvSummary(showrooms, stock?.cctvTotalUnits ?? 0),
    [showrooms, stock],
  );

  /* ------------------------------------------------------- events - */

  // Sidebar "Add showroom" jumps here and opens the drawer.
  const { pendingAddShowroom, clearPendingAddShowroom } = shell;
  useEffect(() => {
    if (pendingAddShowroom > 0) {
      setDrawer({ open: true, showroom: null, mode: "add" });
      clearPendingAddShowroom();
    }
  }, [pendingAddShowroom, clearPendingAddShowroom]);

  const openEdit = (showroom: Showroom) => {
    setDrawer({ open: true, showroom, mode: "edit" });
  };

  const closeDrawer = () => setDrawer({ open: false, showroom: null, mode: "view" });

  const handleSave = async (showroomId: number | null, req: ShowroomSaveRequest) => {
    try {
      await saveShowroom({ showroomId, data: req });
      await qc.invalidateQueries({ queryKey: showroomsQueryOptions().queryKey });
      closeDrawer();
      showToast(showroomId == null ? "Showroom added" : "Your changes have been saved.");
    } catch (err) {
      showToast(`Failed to save showroom: ${messageOf(err)}`, "error");
    }
  };

  const requestDelete = (showroom: Showroom) => {
    setDrawer((prev) => ({ ...prev, open: false }));
    setPendingDelete(showroom);
  };

  const cancelDelete = () => {
    if (!deleting) setPendingDelete(null);
  };

  const confirmDelete = async () => {
    // `disabled` only lands on the next render, so a fast double-click could
    // still fire two deletes.
    if (pendingDelete == null || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      await deleteShowroom({ showroomId: pendingDelete.showroom_id });
      await qc.invalidateQueries({ queryKey: showroomsQueryOptions().queryKey });
      setPendingDelete(null);
      showToast("Showroom deleted");
    } catch (err) {
      showToast(`Failed to delete showroom: ${messageOf(err)}`, "error");
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  const downloadExcel = async () => {
    if (downloadingRef.current) return;
    downloadingRef.current = true;
    setDownloading(true);
    try {
      // The sheet mirrors what is on screen: active tab + search. Its summary
      // block mirrors the header, so it describes every showroom, not the tab.
      await downloadShowroomsWorkbook(visible, cctvSummary, buildShowroomFileName());
      showToast("Excel saved");
    } catch (err) {
      showToast(`Failed to build the Excel file: ${messageOf(err)}`, "error");
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  };

  /**
   * The summary card's one editable number. Resolves false so the card keeps
   * its editor open (and the typed value) when the API refuses the save.
   */
  const saveTotalUnits = async (units: number) => {
    try {
      const saved = await saveShowroomStock({ cctvTotalUnits: units });
      qc.setQueryData(showroomStockQueryOptions().queryKey, saved);
      showToast("Total CCTV units updated");
      return true;
    } catch (err) {
      showToast(`Failed to save the CCTV total: ${messageOf(err)}`, "error");
      return false;
    }
  };

  /* ------------------------------------------------------- render - */

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 gap-3 md:gap-4">
        <header className="asset-inventory-header shrink-0 px-4 md:px-6 pt-4 pb-4 md:pt-6 md:pb-5">
          <div className="relative z-[1] flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between min-w-0">
            <div className="flex items-center gap-3 min-w-0 sm:pb-1">
              <button
                type="button"
                className="lg:hidden text-white/80 hover:text-white"
                onClick={() => shell.openSidebar()}
                aria-label="Open menu"
              >
                ☰
              </button>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white tracking-tight">
                  Showrooms
                </span>
                <span className="text-sm md:text-lg text-white/80 truncate mt-1">
                  CCTV and internet status · All branches
                </span>
              </div>
            </div>

            {!isLoading && !stockLoading && !isError && !stockError && (
              <ShowroomStats
                showrooms={showrooms}
                totalUnits={stock?.cctvTotalUnits ?? 0}
                filter={filter}
                onFilterChange={setFilter}
                onSaveTotal={saveTotalUnits}
              />
            )}
          </div>
        </header>

        {isLoading || stockLoading ? (
          <p className="text-sm text-muted-foreground shrink-0">Loading showrooms…</p>
        ) : isError || stockError ? (
          <div className="bg-card text-card-foreground border border-border rounded-lg px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">Could not load the showrooms.</p>
            {(error ?? stockErrorObj) ? (
              <p className="text-xs text-red-600 mt-2">{messageOf(error ?? stockErrorObj)}</p>
            ) : null}
          </div>
        ) : (
          <ShowroomTable
            showrooms={visible}
            totalCount={showrooms.length}
            counts={counts}
            filter={filter}
            onFilterChange={setFilter}
            searchText={searchText}
            onSearchChange={setSearchText}
            onDownload={() => void downloadExcel()}
            downloading={downloading}
            canDownload={visible.length > 0}
            onEdit={openEdit}
          />
        )}
      </div>

      <ShowroomDrawer
        isOpen={drawer.open}
        showroom={drawer.showroom}
        mode={drawer.mode}
        onClose={closeDrawer}
        onSave={handleSave}
        onDelete={requestDelete}
      />

      <ConfirmModal
        isOpen={pendingDelete != null}
        title="Delete showroom?"
        message={`This will permanently remove ${
          pendingDelete?.showroom_name ?? "this showroom"
        } from the board. This can't be undone.`}
        confirmLabel="Delete"
        busy={deleting}
        busyLabel="Deleting…"
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

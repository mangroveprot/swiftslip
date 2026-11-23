/**
 * Showrooms page.
 *
 * The CCTV / internet status board that sits beside Assets: one row per
 * showroom, grouped into All / Needs action / In progress / Online tabs.
 * Status and Action required are read from the row each showroom is linked to
 * in the "Summary of SR Status and Updates" app; the inventory only edits the
 * CCTV / internet facts and the link itself.
 *
 * The header is deliberately quiet (title, subtitle, date/time) so the board
 * carries the colour, and searching is client-side over the one list payload,
 * like the assets page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu } from "lucide-react";

import { ConfirmModal } from "@/components/common/ConfirmModal";
import { deleteShowroom, saveShowroom } from "@/api/showrooms.functions";
import { toast } from "@/lib/toast";
import type { Showroom, ShowroomFilter, ShowroomSaveRequest } from "@swiftslip/shared/showrooms";
import {
  matchesShowroomFilter,
  showroomInProgress,
  showroomNeedsAction,
  showroomOnline,
} from "@swiftslip/shared/showrooms";
import { formatDate, formatTime } from "@swiftslip/shared/time";

import type { ShowroomDrawerMode } from "../components/ShowroomDrawer";
import { ShowroomDrawer } from "../components/ShowroomDrawer";
import { ErrorStateFromError } from "@/components/common/ErrorStateFromError";
import { ShowroomBoardSkeleton } from "../components/ShowroomSkeleton";
import { ShowroomTable } from "../components/ShowroomTable";
import { buildShowroomFileName, downloadShowroomsWorkbook } from "../lib/showroom-export";
import { showroomLinkOptionsQueryOptions, showroomsQueryOptions } from "../queries";
import { useInventoryShell } from "../shell-context";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function InventoryShowroomsPage() {
  const shell = useInventoryShell();
  const qc = useQueryClient();
  const { data, isLoading, isError, error, errorUpdatedAt, isFetching, refetch } =
    useQuery(showroomsQueryOptions());

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

  // Header clock, down to the minute like every other board.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

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
      await Promise.all([
        qc.invalidateQueries({ queryKey: showroomsQueryOptions().queryKey }),
        // The picker's "Linked to …" labels moved with this save.
        qc.invalidateQueries({ queryKey: showroomLinkOptionsQueryOptions().queryKey }),
      ]);
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: showroomsQueryOptions().queryKey }),
        qc.invalidateQueries({ queryKey: showroomLinkOptionsQueryOptions().queryKey }),
      ]);
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
      // The sheet mirrors what is on screen: active tab + search.
      await downloadShowroomsWorkbook(visible, buildShowroomFileName());
      showToast("Excel saved");
    } catch (err) {
      showToast(`Failed to build the Excel file: ${messageOf(err)}`, "error");
    } finally {
      downloadingRef.current = false;
      setDownloading(false);
    }
  };

  /* ------------------------------------------------------- render - */

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 gap-3 md:gap-4">
        <header className="showroom-page-header shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <button
                type="button"
                className="mt-0.5 -ml-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-orange)] lg:hidden"
                onClick={() => shell.openSidebar()}
                aria-label="Open menu"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="showroom-page-header__title">Showrooms</h1>
                <p className="showroom-page-header__subtitle">
                  CCTV and internet status · All branches
                </p>
              </div>
            </div>

            <div className="showroom-page-header__clock">
              <span className="showroom-page-header__date">{formatDate(now)}</span>
              <span className="showroom-page-header__time">{formatTime(now)}</span>
            </div>
          </div>
        </header>

        {isLoading ? (
          <ShowroomBoardSkeleton />
        ) : isError ? (
          <div className="showroom-board">
            <ErrorStateFromError
              className="flex-1 justify-center"
              error={error}
              at={errorUpdatedAt > 0 ? new Date(errorUpdatedAt) : null}
              retrying={isFetching}
              onRetry={() => {
                void refetch();
              }}
            />
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
            onDelete={requestDelete}
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
        // Edit-mode photos are attached/removed immediately, so the board's
        // thumbnail can change without a form save.
        onPhotosChanged={() => qc.invalidateQueries({ queryKey: showroomsQueryOptions().queryKey })}
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

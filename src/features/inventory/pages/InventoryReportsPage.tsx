/**
 * Reports page — port of `Pages/Reports.razor`: branch report preview with
 * Excel-style floor-sheet tabs and the Download Excel action.
 *
 * The Excel download builds the workbook client-side from the same
 * document the preview renders (see `lib/report-export.ts`); the original
 * hosted the identical build in .NET (`IInventoryReportService`).
 */
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { toast } from "@/lib/toast";
import { buildReportFileName, downloadReportWorkbook } from "../lib/report-export";
import { reportQueryOptions } from "../queries";
import { useInventoryShell } from "../shell-context";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function InventoryReportsPage() {
  const shell = useInventoryShell();
  const showToast = useCallback(
    (message: string, level: "success" | "error" | "warning" | "info" = "success") =>
      toast[level](message),
    [],
  );

  const branchId = shell.selectedBranchId;
  const {
    data: document,
    isLoading,
    isError,
    error,
  } = useQuery({
    ...reportQueryOptions(branchId ?? -1),
    enabled: branchId != null,
  });

  const [busy, setBusy] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  // A fresh document (branch change or data reload) starts back at sheet 0,
  // like the original's `ReloadAsync`.
  useEffect(() => {
    setActiveSheetIndex(0);
  }, [document]);

  const downloadExcel = async () => {
    if (branchId == null || busy || document == null) return;
    setBusy(true);
    try {
      const fileName = buildReportFileName(document.branchName);
      await downloadReportWorkbook(document, fileName);
      showToast("Excel saved");
    } catch (err) {
      showToast(`Download failed: ${messageOf(err)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const shellLoading = shell.branches.length === 0;

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 gap-4">
        <header className="asset-inventory-header shrink-0 px-4 md:px-6 pt-7 pb-5">
          <div className="relative z-[1] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="md:hidden text-white/80 hover:text-white"
                onClick={() => shell.openSidebar()}
                aria-label="Open menu"
              >
                ☰
              </button>
              <div className="flex flex-col leading-tight min-w-0">
                <span className="text-3xl md:text-4xl font-semibold text-white tracking-tight">
                  Reports
                </span>
                <span className="text-sm md:text-lg text-white/80 truncate mt-1">
                  {shell.branchSubtitle}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-semibold bg-[#F25A0B] text-white shadow-lg shadow-black/25 hover:bg-[#d94f0a] disabled:opacity-50"
              disabled={busy || document == null || branchId == null}
              onClick={() => void downloadExcel()}
            >
              {busy ? (
                <span>Preparing…</span>
              ) : (
                <>
                  <svg
                    className="h-4 w-4 shrink-0"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.69L6.03 8.22a.75.75 0 0 0-1.06 1.06l4.5 4.5a.75.75 0 0 0 1.06 0l4.5-4.5a.75.75 0 1 0-1.06-1.06l-3.22 3.22V2.75Z" />
                    <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
                  </svg>
                  <span>Download Excel</span>
                </>
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {shellLoading || (branchId != null && isLoading) ? (
            <p className="text-sm text-slate-400">Loading report…</p>
          ) : branchId == null ? (
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-10 text-center">
              <p className="text-sm text-slate-600">
                Select a branch to preview its inventory report.
              </p>
            </div>
          ) : isError || document == null ? (
            <div className="bg-white border border-slate-200 rounded-lg px-5 py-10 text-center">
              <p className="text-sm text-slate-600">Could not build the report.</p>
              {isError && error ? (
                <p className="text-xs text-red-600 mt-2">{messageOf(error)}</p>
              ) : null}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {document.branchName}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {document.sheets.length} floor sheet{document.sheets.length === 1 ? "" : "s"}
                </span>
              </div>

              {document.sheets.map((sheet, i) => {
                const isActive = i === activeSheetIndex;
                return (
                  <div
                    key={`${sheet.sheetName}-${i}`}
                    className={
                      isActive
                        ? "report-floor-panel"
                        : "report-floor-panel report-floor-panel--hidden"
                    }
                  >
                    <div className="overflow-x-auto">
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
                              {sheet.floorTitle}
                            </th>
                          </tr>
                          <tr className="report-sheet__head">
                            <th>ITEM ID</th>
                            <th>Monitor - Last 10 Digits</th>
                            <th>Keyboard &amp; Mouse</th>
                            <th>Asset Type</th>
                            <th>Cubicle</th>
                            <th>Assigned To</th>
                            <th>Department</th>
                            <th>Location</th>
                            <th>Status</th>
                            <th>Condition</th>
                            <th>Floor</th>
                            <th>Installed</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sheet.rows.length === 0 ? (
                            <tr>
                              <td colSpan={13} className="report-sheet__empty">
                                No assets on this floor.
                              </td>
                            </tr>
                          ) : (
                            sheet.rows.map((row, rowIndex) => (
                              <tr key={`${row.itemId}-${rowIndex}`}>
                                <td>{row.itemId}</td>
                                <td>{row.monitor}</td>
                                <td>{row.keyboardMouse}</td>
                                <td>{row.assetType}</td>
                                <td>{row.cubicle}</td>
                                <td>{row.assignedTo}</td>
                                <td>{row.department}</td>
                                <td>{row.location}</td>
                                <td>{row.status}</td>
                                <td>{row.condition}</td>
                                <td>{row.floor}</td>
                                <td>{row.installed}</td>
                                <td>{row.notes}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-4 py-4 border-t border-slate-100 space-y-1">
                      <p className="text-xs font-semibold text-slate-700">TOTAL OF:</p>
                      {sheet.totals.length === 0 ? (
                        <p className="text-xs text-slate-400">0 items</p>
                      ) : (
                        sheet.totals.map((total) => (
                          <p key={total} className="text-xs text-slate-700">
                            {total}
                          </p>
                        ))
                      )}
                      <p className="text-xs text-slate-400 pt-3">
                        PREPARED BY: RGC-Dipolog IT Personnel
                      </p>
                      <p className="text-xs font-medium text-slate-600">IT SUPPORT</p>
                    </div>
                  </div>
                );
              })}

              {/* Excel-style sheet tabs */}
              <div className="flex items-end gap-0 px-2 pt-2 bg-slate-100 border-t border-slate-200 overflow-x-auto">
                {document.sheets.map((sheet, idx) => (
                  <button
                    type="button"
                    key={`${sheet.sheetName}-${idx}`}
                    className={
                      idx === activeSheetIndex ? "report-tab report-tab--active" : "report-tab"
                    }
                    onClick={() => setActiveSheetIndex(idx)}
                  >
                    {sheet.sheetName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

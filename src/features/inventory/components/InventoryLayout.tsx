/**
 * Inventory shell — React port of `Layout/MainLayout.razor`: sidebar +
 * main area with the `page-enter` keyed outlet, plus the "cascading"
 * shell state (selected branch, sidebar, asset badge, add-asset requests)
 * exposed through `InventoryShellContext`.
 */
import { useCallback, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { InventorySidebar } from "./InventorySidebar";
import { inventoryQueryOptions } from "../queries";
import { InventoryShellContext } from "../shell-context";
import type { InventoryShell, InventoryView } from "../shell-context";

const ROUTES = {
  assets: "/rgc-asset-inventory",
  reports: "/rgc-asset-inventory/reports",
  settings: "/rgc-asset-inventory/settings",
} as const;

export function InventoryLayout() {
  const pathname = useLocation({ select: (s) => s.pathname });
  const navigate = useNavigate();

  const { data } = useQuery(inventoryQueryOptions());
  const branches = useMemo(() => data?.branches ?? [], [data]);

  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [assetCount, setAssetCount] = useState<number | null>(null);
  const [pendingAdd, setPendingAdd] = useState(0);

  // Mirrors `RegisterBranches`: keep the current branch when it still exists,
  // otherwise fall back to the first one.
  const branchList = branches;
  if (branchList.length > 0) {
    const currentIsValid =
      selectedBranchId != null && branchList.some((b) => b.branch_id === selectedBranchId);
    if (!currentIsValid) {
      // setState during render of the same component is legal in React and
      // avoids an extra paint with the wrong subtitle (derived state pattern).
      setSelectedBranchId(branchList[0]?.branch_id ?? null);
    }
  }

  const activeView: InventoryView = pathname.startsWith(ROUTES.reports)
    ? "reports"
    : pathname.startsWith(ROUTES.settings)
      ? "settings"
      : "assets";

  const navigateTo = useCallback(
    (view: InventoryView) => {
      void navigate({ to: ROUTES[view] });
    },
    [navigate],
  );

  const requestAddAsset = useCallback(() => {
    setSidebarOpen(false);
    setPendingAdd((n) => n + 1);
    if (activeView !== "assets") {
      void navigate({ to: ROUTES.assets });
    }
  }, [activeView, navigate]);

  const shell: InventoryShell = useMemo(
    () => ({
      branches,
      selectedBranchId,
      selectBranch: (branchId: number) => {
        // Mirrors `SelectBranch` — same id is a no-op (Home resets filters
        // through its own effect on selectedBranchId).
        if (branchId !== selectedBranchId) setSelectedBranchId(branchId);
      },
      branchSubtitle:
        branches.find((b) => b.branch_id === selectedBranchId)?.branch_name ?? "All branches",
      assetCount,
      setAssetCount,
      activeView,
      navigateTo,
      sidebarOpen,
      openSidebar: () => setSidebarOpen(true),
      closeSidebar: () => setSidebarOpen(false),
      requestAddAsset,
      pendingAdd,
      clearPendingAdd: () => setPendingAdd(0),
    }),
    [
      branches,
      selectedBranchId,
      assetCount,
      activeView,
      navigateTo,
      sidebarOpen,
      requestAddAsset,
      pendingAdd,
    ],
  );

  return (
    <InventoryShellContext.Provider value={shell}>
      <div className="rgc-inventory flex h-screen overflow-hidden relative text-slate-800">
        <InventorySidebar shell={shell} />

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <main className="flex-1 min-h-0 flex flex-col overflow-hidden p-4 md:p-6">
            <div className="page-enter flex flex-col flex-1 min-h-0" key={pathname}>
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </InventoryShellContext.Provider>
  );
}

/**
 * Shell state shared between the inventory layout and its pages — the React
 * equivalent of `MainLayout`'s cascading members (selected branch, sidebar,
 * add-asset requests, asset count badge).
 */
import { createContext, useContext } from "react";

import type { InventoryBranch } from "@/shared/inventory";

export type InventoryView = "assets" | "reports" | "settings";

export type InventoryShell = {
  branches: InventoryBranch[];
  /** `null` until branches load; then always the first/current branch. */
  selectedBranchId: number | null;
  selectBranch: (branchId: number) => void;
  /** Selected branch's name — header subtitle ("All branches" fallback). */
  branchSubtitle: string;
  /** Sidebar "Assets" badge — set by the assets page (`SetAssetCount`). */
  assetCount: number | null;
  setAssetCount: (count: number) => void;
  activeView: InventoryView;
  navigateTo: (view: InventoryView) => void;
  /** Mobile drawer visibility (original `sidebarOpen`). */
  sidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
  /** Sidebar "Add asset": navigates to assets first when needed, then signals. */
  requestAddAsset: () => void;
  /** >0 when an add-asset request is pending; the assets page consumes it. */
  pendingAdd: number;
  clearPendingAdd: () => void;
};

export const InventoryShellContext = createContext<InventoryShell | null>(null);

export function useInventoryShell(): InventoryShell {
  const shell = useContext(InventoryShellContext);
  if (!shell) throw new Error("useInventoryShell must be used inside <InventoryShellContext>");
  return shell;
}

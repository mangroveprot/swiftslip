/**
 * Inventory sidebar — port of `Layout/Sidebar.razor` (regasco header strip,
 * branch dropdown, Add asset, nav items + assets badge, footer).
 * Offline-sync bits from the original are intentionally absent.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, LogOut } from "lucide-react";

import { signOut } from "@/api/auth.functions";
import type { InventoryShell, InventoryView } from "../shell-context";

const NAV_ITEMS: { key: InventoryView; label: string }[] = [
  { key: "assets", label: "Assets" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

function NavIcon({ view }: { view: InventoryView }) {
  if (view === "assets")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    );
  if (view === "reports")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );
}

export function InventorySidebar({ shell }: { shell: InventoryShell }) {
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const closeMenu = () => setBranchMenuOpen(false);

  const switchApp = () => {
    setBranchMenuOpen(false);
    shell.closeSidebar();
    void navigate({ to: "/choose" });
  };

  const handleSignOut = async () => {
    setBranchMenuOpen(false);
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    void navigate({ to: "/", replace: true });
  };

  const selectBranch = (branchId: number) => {
    setBranchMenuOpen(false);
    if (branchId !== shell.selectedBranchId) shell.selectBranch(branchId);
  };

  const handleAddAsset = () => {
    setBranchMenuOpen(false);
    shell.requestAddAsset();
  };

  const sidebarClasses =
    "app-sidebar w-[86vw] max-w-80 h-full border-r border-regasco-deep/30 flex flex-col shrink-0 " +
    "fixed lg:static left-0 z-40 transition-transform duration-200 lg:translate-x-0 inset-y-0 " +
    (shell.sidebarOpen ? "translate-x-0" : "-translate-x-full");

  return (
    <>
      {/* Mobile overlay (matches IsOpen in the original). */}
      {shell.sidebarOpen ? (
        <div
          className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          onClick={() => shell.closeSidebar()}
        />
      ) : null}

      <aside className={sidebarClasses} onClick={closeMenu}>
        <div className="flex flex-col h-full min-h-0">
          <div className="regasco-header h-[7.25rem] flex items-center justify-between gap-3 px-4 pb-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="regasco-header__logo">
                <img src="/inventory/logo.webp" alt="" />
              </div>
              <div className="min-w-0">
                <span className="regasco-mark" aria-label="REGASCO Asset inventory">
                  <span className="regasco-mark__text">REGASCO</span>
                  <span className="regasco-mark__line" aria-hidden="true" />
                  <span className="regasco-mark__sub">Asset inventory</span>
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close menu"
              className="lg:hidden text-white/80 hover:text-white text-lg leading-none shrink-0"
              onClick={() => shell.closeSidebar()}
            >
              &times;
            </button>
          </div>

          <div className="sidebar-controls">
            <div className="px-3.5 relative">
              <p className="sidebar-section-label">Branch</p>
              <button
                type="button"
                className={`sidebar-branch ${branchMenuOpen ? "sidebar-branch--open" : ""}`}
                aria-haspopup="listbox"
                aria-expanded={branchMenuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setBranchMenuOpen((open) => !open);
                }}
              >
                <span className="sidebar-branch__dot" aria-hidden="true" />
                <span className="sidebar-branch__label truncate">
                  {shell.branchSubtitle || "Select branch"}
                </span>
                <svg
                  className={`sidebar-branch__chevron ${
                    branchMenuOpen ? "sidebar-branch__chevron--open" : ""
                  }`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.25a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>

              {branchMenuOpen ? (
                <div
                  className="sidebar-branch-menu"
                  role="listbox"
                  onClick={(e) => e.stopPropagation()}
                >
                  {shell.branches.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-slate-400">No branches loaded</p>
                  ) : (
                    shell.branches.map((branch) => {
                      const selected = branch.branch_id === shell.selectedBranchId;
                      return (
                        <button
                          type="button"
                          key={branch.branch_id}
                          role="option"
                          aria-selected={selected}
                          className={`sidebar-branch-option ${
                            selected ? "sidebar-branch-option--selected" : ""
                          }`}
                          onClick={() => selectBranch(branch.branch_id)}
                        >
                          <span className="truncate">{branch.branch_name}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}

              <button
                type="button"
                className="sidebar-add-asset"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddAsset();
                }}
              >
                <span className="sidebar-add-asset__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                Add asset
              </button>
            </div>

            <nav className="sidebar-nav px-3.5 pt-3 pb-2">
              {NAV_ITEMS.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  className={`sidebar-nav-item ${
                    shell.activeView === item.key ? "sidebar-nav-item--active" : ""
                  }`}
                  onClick={() => {
                    // Close the drawer before/while navigating so the next
                    // page is visible immediately on phones and tablets.
                    shell.closeSidebar();
                    shell.navigateTo(item.key);
                  }}
                >
                  <span className="sidebar-nav-item__icon" aria-hidden="true">
                    <NavIcon view={item.key} />
                  </span>
                  <span className="sidebar-nav-item__label truncate">{item.label}</span>
                  {item.key === "assets" && shell.assetCount != null ? (
                    <span className="sidebar-nav-badge">{shell.assetCount}</span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>

          <div className="sidebar-photo-spacer flex-1 min-h-0" aria-hidden="true" />

          <div className="sidebar-footer">
            <div className="flex items-center gap-2.5 px-1">
              <div className="sidebar-footer__avatar">IT</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <p className="text-sm font-medium leading-none truncate text-white">IT Support</p>
                </div>
                <p className="text-xs text-white/70 leading-none mt-0.5 truncate">
                  {shell.branchSubtitle}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={switchApp}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <LayoutGrid className="size-4 shrink-0" aria-hidden="true" />
                Switch app
              </button>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20"
              >
                <LogOut className="size-4 shrink-0" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

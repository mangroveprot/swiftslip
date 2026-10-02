/**
 * Assets page — port of `Pages/Home.razor`.
 *
 * All filtering is client-side over the one `getInventoryData` payload,
 * exactly like the original's in-memory LINQ over `assetItems`. Offline
 * sync (highlight flashes, forced sync passes) was dropped for the web port.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { deleteAssets, quickCreateOption, saveAsset } from "@/api/inventory.functions";
import { toast } from "@/lib/toast";
import type {
  AssetSaveRequest,
  InventoryAsset,
  InventoryData,
  OptionKind,
} from "@/shared/inventory";

import { ActiveFilterBar } from "../components/ActiveFilterBar";
import type { FilterChip } from "../components/ActiveFilterBar";
import { AssetTable } from "../components/AssetTable";
import { BulkActionBar } from "../components/BulkActionBar";
import { DeleteConfirmModal } from "../components/DeleteConfirmModal";
import { InventoryTopBar } from "../components/InventoryTopBar";
import { StatCards } from "../components/StatCards";
import type { DrawerMode } from "../components/ViewAssetDrawer";
import { ViewAssetDrawer } from "../components/ViewAssetDrawer";
import { compareOrdinalIgnoreCase, distinctSortedFloorLabels, isBlank } from "../lib/helpers";
import { inventoryQueryOptions } from "../queries";
import { useInventoryShell } from "../shell-context";

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function eqIC(value: string | null | undefined, other: string): boolean {
  return (value ?? "").trim().toLowerCase() === other.toLowerCase();
}

export function InventoryHomePage() {
  const shell = useInventoryShell();
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useQuery(inventoryQueryOptions());
  const showToast = useCallback(
    (message: string, level: "success" | "error" | "warning" | "info" = "success") =>
      toast[level](message),
    [],
  );

  // One memo keeps the fallback-empty arrays referentially stable so the
  // derived memos below don't recompute on every render.
  const { assets, branches, departments, statusOptions, conditionOptions, assetTypes } = useMemo(
    () => ({
      assets: data?.assets ?? [],
      branches: data?.branches ?? [],
      departments: data?.departments ?? [],
      statusOptions: data?.statusOptions ?? [],
      conditionOptions: data?.conditionOptions ?? [],
      assetTypes: data?.assetTypes ?? [],
    }),
    [data],
  );

  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [selectedFloorLabel, setSelectedFloorLabel] = useState<string | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [statFilter, setStatFilter] = useState("all");

  const [drawer, setDrawer] = useState<{
    open: boolean;
    asset: InventoryAsset | null;
    mode: DrawerMode;
  }>({ open: false, asset: null, mode: "view" });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<InventoryAsset[]>([]);

  /* ------------------------------------------------------ derived - */

  /** Distinct floor labels for the selected branch (`FloorLabelsForCurrentBranch`). */
  const floorLabels = useMemo(
    () =>
      distinctSortedFloorLabels(
        assets
          .filter((a) => shell.selectedBranchId == null || a.branch_id === shell.selectedBranchId)
          .map((a) => a.floor_label),
      ),
    [assets, shell.selectedBranchId],
  );

  /** All floor labels keyed by branch — drives the drawer's floor dropdown. */
  const floorsByBranchId = useMemo(() => {
    const grouped = new Map<number, string[]>();
    for (const asset of assets) {
      if (asset.branch_id == null || isBlank(asset.floor_label)) continue;
      const list = grouped.get(asset.branch_id) ?? [];
      list.push((asset.floor_label ?? "").trim());
      grouped.set(asset.branch_id, list);
    }
    const out: Record<number, string[]> = {};
    for (const [branchId, floors] of grouped) {
      out[branchId] = [...floors]
        .sort(compareOrdinalIgnoreCase)
        .filter(
          (floor, index, all) =>
            all.findIndex((f) => f.toLowerCase() === floor.toLowerCase()) === index,
        );
    }
    return out;
  }, [assets]);

  const scoped = useMemo(
    () =>
      assets.filter(
        (a) =>
          (shell.selectedBranchId == null || a.branch_id === shell.selectedBranchId) &&
          (selectedFloorLabel == null || eqIC(a.floor_label, selectedFloorLabel)),
      ),
    [assets, shell.selectedBranchId, selectedFloorLabel],
  );

  const matchesStatFilter = useCallback(
    (asset: InventoryAsset): boolean => {
      if (statFilter === "unassigned") return isBlank(asset.assigned_to);
      if (statFilter === "inuse") return eqIC(asset.status?.status_name, "In use");
      if (statFilter === "available") return eqIC(asset.status?.status_name, "Available");
      return true;
    },
    [statFilter],
  );

  const filtered = useMemo(() => scoped.filter(matchesStatFilter), [scoped, matchesStatFilter]);

  const visible = useMemo(() => {
    const needle = searchText.toLowerCase();
    return filtered.filter(
      (a) =>
        (selectedTypeId == null || a.type_id === selectedTypeId) &&
        (isBlank(searchText) ||
          (a.item_id?.toLowerCase().includes(needle) ?? false) ||
          (a.assigned_to?.toLowerCase().includes(needle) ?? false) ||
          (a.department?.department_name?.toLowerCase().includes(needle) ?? false)),
    );
  }, [filtered, selectedTypeId, searchText]);

  // Status/availability tallies over the scoped set in a single pass, recomputed
  // only when the scope changes (not on every render or keystroke).
  const { inUseCount, availableCount, unassignedCount } = useMemo(() => {
    let inUse = 0;
    let available = 0;
    let unassigned = 0;
    for (const a of scoped) {
      if (eqIC(a.status?.status_name, "In use")) inUse++;
      if (eqIC(a.status?.status_name, "Available")) available++;
      if (isBlank(a.assigned_to)) unassigned++;
    }
    return { inUseCount: inUse, availableCount: available, unassignedCount: unassigned };
  }, [scoped]);

  // Selection-derived flags depend on both the scope and the selected set.
  const { selectedCount, allSelected } = useMemo(() => {
    let count = 0;
    for (const a of scoped) if (selectedIds.has(a.asset_id)) count++;
    return { selectedCount: count, allSelected: scoped.length > 0 && count === scoped.length };
  }, [scoped, selectedIds]);

  const activeFilterChips = useMemo(() => {
    const chips: FilterChip[] = [];
    if (!isBlank(selectedFloorLabel))
      chips.push({ key: "floor", kind: "Floor", label: selectedFloorLabel ?? "" });

    if (statFilter.toLowerCase() !== "all" && !isBlank(statFilter)) {
      const label =
        statFilter === "unassigned"
          ? "Unassigned"
          : statFilter === "inuse"
            ? "In use"
            : statFilter === "available"
              ? "Available"
              : statFilter;
      chips.push({ key: "stat", kind: "Status", label });
    }

    if (selectedTypeId != null) {
      const typeName = assetTypes.find((t) => t.type_id === selectedTypeId)?.type_name;
      chips.push({ key: "type", kind: "Type", label: typeName ?? `Type #${selectedTypeId}` });
    }

    if (!isBlank(searchText))
      chips.push({ key: "search", kind: "Search", label: searchText.trim() });

    return chips;
  }, [selectedFloorLabel, statFilter, selectedTypeId, assetTypes, searchText]);

  /* ------------------------------------------------------- effects - */

  // Branch switch resets floor + stat filter (`OnLayoutBranchChanged`).
  useEffect(() => {
    setSelectedFloorLabel(null);
    setStatFilter("all");
  }, [shell.selectedBranchId]);

  // Sidebar badge (`Layout.SetAssetCount` from `OnAfterRender`).
  useEffect(() => {
    shell.setAssetCount(scoped.length);
  }, [scoped.length, shell]);

  // Add-asset request arriving from the sidebar (possibly after navigation).
  const { pendingAdd, clearPendingAdd } = shell;
  useEffect(() => {
    if (pendingAdd > 0) {
      setDrawer({ open: true, asset: null, mode: "add" });
      clearPendingAdd();
    }
  }, [pendingAdd, clearPendingAdd]);

  // Query failure → the original's "Failed to load data: …" toast.
  useEffect(() => {
    if (isError) showToast(`Failed to load data: ${messageOf(error)}`, "error");
  }, [isError, error, showToast]);

  /* ----------------------------------------------------- handlers - */

  const onFloorSelect = (floorLabel: string | null) => {
    setSelectedFloorLabel(floorLabel);
    setStatFilter("all");
  };

  const onStatFilterSelect = (key: string) => {
    setStatFilter(isBlank(key) ? "all" : key.trim().toLowerCase());
  };

  const removeFilterChip = (key: string) => {
    if (key === "floor") setSelectedFloorLabel(null);
    else if (key === "stat") setStatFilter("all");
    else if (key === "type") setSelectedTypeId(null);
    else if (key === "search") setSearchText("");
  };

  const clearAllFilters = () => {
    setSelectedFloorLabel(null);
    setStatFilter("all");
    setSelectedTypeId(null);
    setSearchText("");
  };

  // Stable identity so memoized <AssetTable>/<AssetRow> skip re-renders
  // when unrelated page state changes.
  const selectAllChanged = useCallback(
    (value: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const item of scoped) {
          if (value) next.add(item.asset_id);
          else next.delete(item.asset_id);
        }
        return next;
      });
    },
    [scoped],
  );

  // Stable so the memoized <AssetRow>s don't re-render when unrelated state changes.
  const rowSelectedChanged = useCallback((assetId: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(assetId);
      else next.delete(assetId);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  const openViewDrawer = useCallback(
    (asset: InventoryAsset) => setDrawer({ open: true, asset, mode: "view" }),
    [],
  );
  const openEditDrawer = openViewDrawer;

  const requestDeleteOne = useCallback((asset: InventoryAsset) => {
    setPendingDelete([asset]);
    setDeleteModalOpen(true);
  }, []);

  const requestBulkDelete = () => {
    const selected = scoped.filter((a) => selectedIds.has(a.asset_id));
    if (selected.length === 0) return;
    setPendingDelete(selected);
    setDeleteModalOpen(true);
  };

  const cancelDelete = () => {
    setDeleteModalOpen(false);
    setPendingDelete([]);
  };

  const confirmDelete = async () => {
    const count = pendingDelete.length;
    const ids = pendingDelete.map((a) => a.asset_id);
    try {
      await deleteAssets({ data: { ids } });
      await qc.invalidateQueries({ queryKey: inventoryQueryOptions().queryKey });
      setPendingDelete([]);
      setDeleteModalOpen(false);
      showToast(count > 1 ? `${count} assets deleted` : "Asset deleted");
    } catch (err) {
      showToast(`Failed to delete asset(s): ${messageOf(err)}`, "error");
    }
  };

  const closeDrawer = () => setDrawer({ open: false, asset: null, mode: "view" });

  const fromDrawerDelete = (asset: InventoryAsset) => {
    setDrawer((prev) => ({ ...prev, open: false }));
    requestDeleteOne(asset);
  };

  const handleSave = async (req: AssetSaveRequest) => {
    const isNew = req.assetId == null;
    try {
      await saveAsset({ data: req });
      await qc.invalidateQueries({ queryKey: inventoryQueryOptions().queryKey });

      if (isNew) {
        closeDrawer();
      } else {
        const fresh =
          (
            qc.getQueryData(inventoryQueryOptions().queryKey) as InventoryData | undefined
          )?.assets.find((a) => a.asset_id === req.assetId) ?? null;
        setDrawer({ open: true, asset: fresh, mode: "view" });
      }
      showToast(isNew ? "Asset added" : "Your changes have been saved.");
    } catch (err) {
      showToast(`Failed to save asset: ${messageOf(err)}`, "error");
    }
  };

  const quickCreate = async (
    kind: OptionKind,
    name: string,
    category?: string,
  ): Promise<number> => {
    const created = await quickCreateOption({
      data: category === undefined ? { kind, name } : { kind, name, category },
    });
    await qc.invalidateQueries({ queryKey: inventoryQueryOptions().queryKey });
    return created.id;
  };

  /* ------------------------------------------------------- render - */

  return (
    <>
      <div className="home-page flex flex-col flex-1 min-h-0 gap-3 md:gap-4">
        <div className="shrink-0">
          <InventoryTopBar
            branchSubtitle={shell.branchSubtitle}
            floorLabels={floorLabels}
            selectedFloorLabel={selectedFloorLabel}
            onMenuToggle={() => shell.openSidebar()}
            onFloorSelect={onFloorSelect}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400 shrink-0">Loading…</p>
        ) : (
          <>
            <div className="shrink-0">
              <StatCards
                total={scoped.length}
                inUse={inUseCount}
                available={availableCount}
                unassigned={unassignedCount}
                selectedFilter={statFilter}
                onFilterSelect={onStatFilterSelect}
              />
            </div>

            <div className="shrink-0">
              <ActiveFilterBar
                chips={activeFilterChips}
                matchCount={visible.length}
                scopeCount={scoped.length}
                onRemoveChip={removeFilterChip}
                onClearAll={clearAllFilters}
              />

              <BulkActionBar
                selectedCount={selectedCount}
                onClear={clearSelection}
                onBulkDelete={requestBulkDelete}
              />
            </div>

            <AssetTable
              assets={visible}
              selectedIds={selectedIds}
              totalCount={filtered.length}
              assetTypes={assetTypes}
              selectedTypeId={selectedTypeId}
              searchText={searchText}
              allSelected={allSelected}
              onSelectAllChanged={selectAllChanged}
              onRowSelectedChanged={rowSelectedChanged}
              onView={openViewDrawer}
              onEdit={openEditDrawer}
              onDelete={requestDeleteOne}
              onTypeFilterChanged={setSelectedTypeId}
              onSearchChanged={setSearchText}
            />
          </>
        )}
      </div>

      <ViewAssetDrawer
        isOpen={drawer.open}
        asset={drawer.asset}
        mode={drawer.mode}
        branches={branches}
        floorsByBranchId={floorsByBranchId}
        defaultBranchId={shell.selectedBranchId}
        departments={departments}
        statusOptions={statusOptions}
        conditionOptions={conditionOptions}
        assetTypes={assetTypes}
        onClose={closeDrawer}
        onSave={handleSave}
        onDelete={fromDrawerDelete}
        createBranch={(name) => quickCreate("branch", name)}
        createDepartment={(name) => quickCreate("department", name)}
        createStatus={(name) => quickCreate("status", name)}
        createCondition={(name) => quickCreate("condition", name)}
        createAssetType={(name, category) => quickCreate("assetType", name, category)}
      />

      <DeleteConfirmModal
        isOpen={deleteModalOpen}
        count={pendingDelete.length}
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

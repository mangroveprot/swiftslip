/**
 * Searchable/type-filtered asset table, port of `AssetTable.razor`.
 * The tbody keeps a stable identity (the original's `RowsEpoch` remount is
 * dropped) so filtering reconciles rows by `asset_id` instead of remounting
 * them; newly mounted rows still fade in. The search box holds an instant
 * local value and debounces up to the parent, and the component is memoized
 * so parent renders that don't touch table props skip it entirely.
 */
import { memo, useEffect, useState } from "react";

import { AssetCard } from "./AssetCard";
import { AssetRow } from "./AssetRow";
import { StatTabs } from "./StatTabs";
import type { StatFilterKey } from "./StatTabs";
import type { InventoryAsset, InventoryAssetTypeOption } from "@swiftslip/shared/inventory";

type AssetTableProps = {
  assets: InventoryAsset[];
  selectedIds: Set<number>;
  totalCount: number;
  assetTypes: InventoryAssetTypeOption[];
  selectedTypeId: number | null;
  searchText: string;
  allSelected: boolean;
  totalAssets: number;
  inUseCount: number;
  availableCount: number;
  unassignedCount: number;
  selectedFilter: string;
  onSelectAllChanged: (checked: boolean) => void;
  onRowSelectedChanged: (assetId: number, checked: boolean) => void;
  onView: (asset: InventoryAsset) => void;
  onEdit: (asset: InventoryAsset) => void;
  onDelete: (asset: InventoryAsset) => void;
  onTypeFilterChanged: (typeId: number | null) => void;
  onSearchChanged: (text: string) => void;
  onFilterSelect: (key: StatFilterKey) => void;
};

export const AssetTable = memo(function AssetTable({
  assets,
  selectedIds,
  totalCount,
  assetTypes,
  selectedTypeId,
  searchText,
  allSelected,
  totalAssets,
  inUseCount,
  availableCount,
  unassignedCount,
  selectedFilter,
  onSelectAllChanged,
  onRowSelectedChanged,
  onView,
  onEdit,
  onDelete,
  onTypeFilterChanged,
  onSearchChanged,
  onFilterSelect,
}: AssetTableProps) {
  // Local, instant value for the search box; the actual (expensive) filtering
  // is debounced so typing stays smooth on large asset lists.
  const [search, setSearch] = useState(searchText);

  // Keep the box in sync when the parent resets the search externally
  // (clear-all / remove chip).
  useEffect(() => {
    setSearch(searchText);
  }, [searchText]);

  // Debounce propagation of the typed text to the parent filter.
  useEffect(() => {
    if (search === searchText) return;
    const timer = setTimeout(() => onSearchChanged(search), 200);
    return () => clearTimeout(timer);
  }, [search, searchText, onSearchChanged]);

  return (
    <div className="asset-table">
      <StatTabs
        total={totalAssets}
        inUse={inUseCount}
        available={availableCount}
        unassigned={unassignedCount}
        selectedFilter={selectedFilter}
        onFilterSelect={onFilterSelect}
      />

      <div className="asset-table__toolbar">
        <div className="relative w-full md:w-96">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M8.5 14.5a6 6 0 1 1 0-12 6 6 0 0 1 0 12Zm5.7-1.1 3.4 3.4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            type="text"
            id="asset-search"
            name="asset-search"
            aria-label="Search assets"
            value={search}
            placeholder="Search by item ID, name, or department"
            className="asset-table__search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <label className="inventory-type">
            <span className="inventory-type__label">Type:</span>
            <select
              id="asset-type"
              name="asset-type"
              aria-label="Filter by type"
              className="inventory-type__select"
              value={selectedTypeId ?? ""}
              onChange={(e) =>
                onTypeFilterChanged(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              <option value="">All types</option>
              {assetTypes.map((type) => (
                <option key={type.type_id} value={type.type_id}>
                  {type.type_name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Phone layout: the table header has nowhere to go, so select-all lives
          in its own strip above the stacked cards. */}
      <div className="asset-table__mobile-bar md:hidden">
        <label className="asset-table__select-all">
          <input
            type="checkbox"
            id="asset-select-all-mobile"
            name="asset-select-all-mobile"
            aria-label="Select all assets"
            className="size-4 accent-[var(--inv-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--inv-orange)] focus-visible:ring-offset-1"
            checked={allSelected}
            onChange={(e) => onSelectAllChanged(e.target.checked)}
          />
          Select all
        </label>
      </div>

      <div className="asset-cards md:hidden">
        {assets.length === 0 ? (
          <div className="asset-card__empty">
            <p className="text-sm font-medium text-foreground">No assets match this view</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust filters or clear search to see more records.
            </p>
          </div>
        ) : (
          assets.map((asset, index) => (
            <AssetCard
              key={asset.asset_id}
              asset={asset}
              selected={selectedIds.has(asset.asset_id)}
              index={index}
              onSelectedChanged={onRowSelectedChanged}
              onView={onView}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      <div className="asset-table__scroll hidden md:block">
        <table className="w-full text-sm table-fixed min-w-[26rem] lg:min-w-0">
          <thead>
            <tr className="asset-table__head">
              <th className="asset-table__th w-9">
                <input
                  type="checkbox"
                  id="asset-select-all"
                  name="asset-select-all"
                  aria-label="Select all assets"
                  className="size-4 accent-[var(--inv-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--inv-orange)] focus-visible:ring-offset-1"
                  checked={allSelected}
                  onChange={(e) => onSelectAllChanged(e.target.checked)}
                />
              </th>
              <th className="asset-table__th w-[30%] md:w-[28%] xl:w-[18%]">Item ID</th>
              <th className="asset-table__th w-[12%] hidden md:table-cell md:w-[13%] xl:w-[9%]">
                Type
              </th>
              <th className="asset-table__th w-[28%] md:w-[27%] xl:w-[14%]">Assigned to</th>
              <th className="asset-table__th w-[17%] hidden xl:table-cell">Department</th>
              <th className="asset-table__th w-[7%] hidden xl:table-cell">Cubicle</th>
              <th className="asset-table__th w-[15%] md:w-[14%] xl:w-[9%]">Status</th>
              <th className="asset-table__th w-[10%] hidden xl:table-cell">Condition</th>
              <th className="asset-table__th asset-table__th--actions w-[8.5rem] xl:w-[13%]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-14 text-center">
                  <p className="text-sm font-medium text-foreground">No assets match this view</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Adjust filters or clear search to see more records.
                  </p>
                </td>
              </tr>
            ) : (
              assets.map((asset, index) => (
                <AssetRow
                  key={asset.asset_id}
                  asset={asset}
                  selected={selectedIds.has(asset.asset_id)}
                  index={index}
                  onSelectedChanged={onRowSelectedChanged}
                  onView={onView}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="asset-table__footer hidden md:flex">
        <span className="asset-table__meta">
          Showing <strong className="text-foreground">{assets.length}</strong> of{" "}
          <strong className="text-foreground">{totalCount}</strong> assets
        </span>
      </div>
    </div>
  );
});

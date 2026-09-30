/**
 * Searchable/type-filtered asset table — port of `AssetTable.razor`.
 * The tbody keeps a stable identity (the original's `RowsEpoch` remount is
 * dropped) so filtering reconciles rows by `asset_id` instead of remounting
 * them; newly mounted rows still fade in. The search box holds an instant
 * local value and debounces up to the parent, and the component is memoized
 * so parent renders that don't touch table props skip it entirely.
 */
import { memo, useEffect, useState } from "react";

import { AssetRow } from "./AssetRow";
import type { InventoryAsset, InventoryAssetTypeOption } from "@/shared/inventory";

type AssetTableProps = {
  assets: InventoryAsset[];
  selectedIds: Set<number>;
  totalCount: number;
  assetTypes: InventoryAssetTypeOption[];
  selectedTypeId: number | null;
  searchText: string;
  allSelected: boolean;
  onSelectAllChanged: (checked: boolean) => void;
  onRowSelectedChanged: (assetId: number, checked: boolean) => void;
  onView: (asset: InventoryAsset) => void;
  onEdit: (asset: InventoryAsset) => void;
  onDelete: (asset: InventoryAsset) => void;
  onTypeFilterChanged: (typeId: number | null) => void;
  onSearchChanged: (text: string) => void;
};

function typeTabClass(selectedTypeId: number | null, typeId: number | null): string {
  return typeId === selectedTypeId
    ? "asset-table__type asset-table__type--active"
    : "asset-table__type";
}

export const AssetTable = memo(function AssetTable({
  assets,
  selectedIds,
  totalCount,
  assetTypes,
  selectedTypeId,
  searchText,
  allSelected,
  onSelectAllChanged,
  onRowSelectedChanged,
  onView,
  onEdit,
  onDelete,
  onTypeFilterChanged,
  onSearchChanged,
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
      <div className="asset-table__toolbar">
        <div className="relative w-full sm:w-80">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
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
            value={search}
            placeholder="Search by item ID, name, or department"
            className="asset-table__search"
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="asset-table__types" role="tablist" aria-label="Asset type">
          <button
            type="button"
            role="tab"
            className={typeTabClass(selectedTypeId, null)}
            onClick={() => onTypeFilterChanged(null)}
          >
            All types
          </button>
          {assetTypes.map((type) => (
            <button
              type="button"
              role="tab"
              key={type.type_id}
              className={typeTabClass(selectedTypeId, type.type_id)}
              onClick={() => onTypeFilterChanged(type.type_id)}
            >
              {type.type_name}
            </button>
          ))}
        </div>
      </div>

      <div className="asset-table__scroll">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="asset-table__head">
              <th className="asset-table__th w-9">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-brand focus:ring-brand/30"
                  checked={allSelected}
                  onChange={(e) => onSelectAllChanged(e.target.checked)}
                />
              </th>
              <th className="asset-table__th w-[15%]">Item ID</th>
              <th className="asset-table__th w-[10%]">Type</th>
              <th className="asset-table__th w-[18%]">Assigned to</th>
              <th className="asset-table__th w-[16%]">Department</th>
              <th className="asset-table__th w-[9%]">Cubicle</th>
              <th className="asset-table__th w-24">Status</th>
              <th className="asset-table__th w-24">Condition</th>
              <th className="asset-table__th asset-table__th--actions w-20 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-14 text-center">
                  <p className="text-sm font-medium text-slate-700">No assets match this view</p>
                  <p className="mt-1 text-xs text-slate-400">
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

      <div className="asset-table__footer">
        <span className="asset-table__meta">
          Showing <strong className="text-slate-700">{assets.length}</strong> of{" "}
          <strong className="text-slate-700">{totalCount}</strong> assets
        </span>
      </div>
    </div>
  );
});

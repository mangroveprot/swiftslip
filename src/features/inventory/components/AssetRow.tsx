/**
 * Asset table row — port of `AssetRow.razor` (minus the offline-sync
 * `RemoteHighlight` flash classes, which were dropped with sync).
 */
import { memo } from "react";
import type { CSSProperties } from "react";

import type { InventoryAsset } from "@/shared/inventory";

import { conditionBadgeClasses, isBlank, statusBadgeClasses } from "../lib/helpers";

type AssetRowProps = {
  asset: InventoryAsset;
  selected: boolean;
  index: number;
  onSelectedChanged: (assetId: number, checked: boolean) => void;
  onView: (asset: InventoryAsset) => void;
  onEdit: (asset: InventoryAsset) => void;
  onDelete: (asset: InventoryAsset) => void;
};

export const AssetRow = memo(function AssetRow({
  asset,
  selected,
  index,
  onSelectedChanged,
  onView,
  onEdit,
  onDelete,
}: AssetRowProps) {
  return (
    <tr
      className="asset-table__row asset-row-fade-in-right group cursor-pointer"
      style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
      onClick={() => onView(asset)}
    >
      <td className="asset-table__td" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="rounded border-slate-300 text-brand focus:ring-brand/30"
          checked={selected}
          onChange={(e) => onSelectedChanged(asset.asset_id, e.target.checked)}
        />
      </td>

      <td className="asset-table__td">
        {isBlank(asset.item_id) ? (
          <span className="asset-table__id asset-table__id--missing">— missing —</span>
        ) : (
          <span className="asset-table__id" title={asset.item_id ?? undefined}>
            {asset.item_id}
          </span>
        )}
      </td>

      <td className="asset-table__td">
        <span className="asset-table__type-chip">{asset.type?.type_name ?? "—"}</span>
      </td>

      <td className="asset-table__td truncate">
        {isBlank(asset.assigned_to) ? (
          <span className="asset-table__unassigned">Unassigned</span>
        ) : (
          <span className="text-slate-700">{asset.assigned_to}</span>
        )}
      </td>

      <td className="asset-table__td text-slate-600 truncate">
        {asset.department?.department_name ?? "—"}
      </td>
      <td className="asset-table__td text-slate-600 truncate">
        {isBlank(asset.cubicle_seat) ? "—" : asset.cubicle_seat}
      </td>

      <td className="asset-table__td">
        <span className={`asset-table__badge ${statusBadgeClasses(asset.status)}`}>
          {asset.status?.status_name ?? "—"}
        </span>
      </td>

      <td className="asset-table__td">
        <span
          className={`asset-table__badge ${conditionBadgeClasses(asset.condition?.condition_name)}`}
        >
          {asset.condition?.condition_name ?? "—"}
        </span>
      </td>

      <td className="asset-table__td asset-table__actions" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Edit"
            aria-label="Edit"
            className="asset-table__icon-btn"
            onClick={() => onEdit(asset)}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 3.487a2.25 2.25 0 0 1 3.182 3.182L8.25 18.463 3 19.5l1.037-5.25L16.862 3.487Z"
              />
            </svg>
          </button>
          <button
            type="button"
            title="Delete"
            aria-label="Delete"
            className="asset-table__icon-btn asset-table__icon-btn--danger"
            onClick={() => onDelete(asset)}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2 0v13.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V6h12ZM10 11v6M14 11v6"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});

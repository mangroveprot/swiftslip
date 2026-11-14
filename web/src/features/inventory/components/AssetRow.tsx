/**
 * Asset table row, port of `AssetRow.razor` (minus the offline-sync
 * `RemoteHighlight` flash classes, which were dropped with sync).
 */
import { memo } from "react";
import type { CSSProperties } from "react";
import { PencilLine, Trash2 } from "lucide-react";

import type { InventoryAsset } from "@swiftslip/shared/inventory";

import { isBlank } from "../lib/helpers";

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
      className={`asset-table__row asset-row-fade-in-right group cursor-pointer ${
        selected ? "asset-table__row--selected" : ""
      }`}
      style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
      onClick={() => onView(asset)}
    >
      <td className="asset-table__td" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          id={`asset-row-${asset.asset_id}-selected`}
          name="asset-row-selected"
          aria-label={`Select ${asset.item_id ?? "asset"}`}
          className="size-4 accent-[var(--inv-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--inv-orange)] focus-visible:ring-offset-1"
          checked={selected}
          onChange={(e) => onSelectedChanged(asset.asset_id, e.target.checked)}
        />
      </td>

      <td className="asset-table__td">
        {isBlank(asset.item_id) ? (
          <span className="asset-table__id asset-table__id--missing">Missing</span>
        ) : (
          <span className="asset-table__id" title={asset.item_id ?? undefined}>
            {asset.item_id}
          </span>
        )}
      </td>

      <td className="asset-table__td hidden md:table-cell">
        <span className="asset-table__type-chip">{asset.type?.type_name ?? "—"}</span>
      </td>

      <td
        className="asset-table__td truncate"
        title={isBlank(asset.assigned_to) ? undefined : (asset.assigned_to ?? undefined)}
      >
        {isBlank(asset.assigned_to) ? (
          <span className="asset-table__unassigned">Unassigned</span>
        ) : (
          <span className="text-foreground">{asset.assigned_to}</span>
        )}
      </td>

      <td
        className="asset-table__td text-muted-foreground truncate hidden xl:table-cell"
        title={asset.department?.department_name ?? undefined}
      >
        {asset.department?.department_name ?? "—"}
      </td>
      <td className="asset-table__td text-muted-foreground truncate hidden xl:table-cell">
        {isBlank(asset.cubicle_seat) ? "—" : asset.cubicle_seat}
      </td>

      <td className="asset-table__td">
        <span className="asset-table__status">{asset.status?.status_name ?? "—"}</span>
      </td>

      <td className="asset-table__td hidden xl:table-cell">
        <span className="asset-table__condition">{asset.condition?.condition_name ?? "—"}</span>
      </td>

      <td className="asset-table__td asset-table__actions" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-start gap-1">
          <button
            type="button"
            aria-label="Edit"
            className="row-action"
            onClick={() => onEdit(asset)}
          >
            <PencilLine className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            aria-label="Delete"
            className="row-action row-action--danger"
            onClick={() => onDelete(asset)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
});

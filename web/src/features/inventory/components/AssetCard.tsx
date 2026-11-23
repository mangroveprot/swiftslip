/**
 * Phone-width asset row. Below `md` the table becomes this flat row: the
 * checkbox, item ID with `type · assigned` and the department under it, the
 * status and condition stacked, then the `…` menu at the right edge.
 */
import { memo } from "react";
import type { CSSProperties } from "react";

import type { InventoryAsset } from "@swiftslip/shared/inventory";

import { isBlank } from "../lib/helpers";
import { AssetActionsMenu } from "./AssetActionsMenu";

type AssetCardProps = {
  asset: InventoryAsset;
  selected: boolean;
  index: number;
  onSelectedChanged: (assetId: number, checked: boolean) => void;
  onView: (asset: InventoryAsset) => void;
  onEdit: (asset: InventoryAsset) => void;
  onDelete: (asset: InventoryAsset) => void;
};

function joinMeta(parts: Array<string | null>): string {
  return parts.filter((part): part is string => part != null && part.trim() !== "").join(" · ");
}

export const AssetCard = memo(function AssetCard({
  asset,
  selected,
  index,
  onSelectedChanged,
  onView,
  onEdit,
  onDelete,
}: AssetCardProps) {
  const missingId = isBlank(asset.item_id);

  const typeAndAssigned = joinMeta([
    asset.type?.type_name?.trim() ?? null,
    isBlank(asset.assigned_to) ? "Unassigned" : (asset.assigned_to?.trim() ?? null),
  ]);

  const department = isBlank(asset.department?.department_name)
    ? null
    : (asset.department?.department_name?.trim() ?? null);

  return (
    <div
      className={`asset-card asset-row-fade-in-right group cursor-pointer ${
        selected ? "asset-card--selected" : ""
      }`}
      style={{ "--row-i": Math.min(index, 12) } as CSSProperties}
      onClick={() => onView(asset)}
    >
      <div className="asset-card__check" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          id={`asset-card-${asset.asset_id}-selected`}
          name="asset-row-selected"
          aria-label={`Select ${asset.item_id ?? "asset"}`}
          className="size-4 accent-[var(--inv-orange)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--inv-orange)] focus-visible:ring-offset-1"
          checked={selected}
          onChange={(e) => onSelectedChanged(asset.asset_id, e.target.checked)}
        />
      </div>

      <div className="asset-card__body">
        <span
          className={missingId ? "asset-card__id asset-table__id--missing" : "asset-card__id"}
          title={asset.item_id ?? undefined}
        >
          {missingId ? "Missing" : asset.item_id}
        </span>
        {typeAndAssigned !== "" && <p className="asset-card__meta">{typeAndAssigned}</p>}
        {department && <p className="asset-card__meta">{department}</p>}
      </div>

      <div className="asset-card__facts">
        <span className="asset-card__status">{asset.status?.status_name ?? "—"}</span>
        <span className="asset-card__condition">{asset.condition?.condition_name ?? "—"}</span>
      </div>

      <div className="asset-card__actions" onClick={(e) => e.stopPropagation()}>
        <AssetActionsMenu asset={asset} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
});

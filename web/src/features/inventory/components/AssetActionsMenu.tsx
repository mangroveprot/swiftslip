/**
 * The asset row's "…" menu. Edit and Delete live inside it so a row shows one
 * quiet trigger instead of two text buttons, the same pattern the Showrooms
 * board uses. The trigger never opens the drawer underneath.
 */
import { MoreHorizontal, PencilLine, Trash2 } from "lucide-react";

import type { InventoryAsset } from "@swiftslip/shared/inventory";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AssetActionsMenuProps = {
  asset: InventoryAsset;
  onEdit: (asset: InventoryAsset) => void;
  onDelete: (asset: InventoryAsset) => void;
};

export function AssetActionsMenu({ asset, onEdit, onDelete }: AssetActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="row-menu__trigger"
          aria-label={`Actions for ${asset.item_id ?? "this asset"}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => onEdit(asset)}>
          <PencilLine className="size-4" aria-hidden="true" />
          Edit asset
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDelete(asset)}
          className="text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete asset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

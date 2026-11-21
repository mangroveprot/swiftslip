/**
 * The board's bulk selection bar. Shown only while rows are ticked, directly
 * above the table so the action sits beside the checkboxes that produced it.
 * Mirrors the Inventory board's `BulkActionBar` (Clear + red Delete) in this
 * app's neutral palette.
 */
import { Trash2 } from "lucide-react";

type UpdatesBulkBarProps = {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
};

export function UpdatesBulkBar({ selectedCount, onClear, onDelete }: UpdatesBulkBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-secondary/40 px-4 py-2">
      <p className="text-xs font-medium text-foreground">
        <span className="tabular-nums">{selectedCount}</span> selected
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Clear selection
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Delete selected
        </button>
      </div>
    </div>
  );
}

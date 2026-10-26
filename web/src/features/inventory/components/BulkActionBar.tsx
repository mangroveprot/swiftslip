/**
 * Bulk selection action bar — port of `BulkActionBar.razor`.
 * Hidden when nothing is selected.
 */
type BulkActionBarProps = {
  selectedCount: number;
  onClear: () => void;
  onBulkDelete: () => void;
};

export function BulkActionBar({ selectedCount, onClear, onBulkDelete }: BulkActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-2 sm:gap-0 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 mb-3">
      <p className="text-sm text-blue-800">
        <span className="font-semibold">{selectedCount}</span> selected
      </p>
      <div className="flex items-center gap-2">
        <button type="button" className="text-sm text-blue-700 hover:underline" onClick={onClear}>
          Clear selection
        </button>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700"
          onClick={onBulkDelete}
        >
          Delete selected
        </button>
      </div>
    </div>
  );
}
